"""
Tatra T3B-928 V8 Predictive Maintenance Testbed - FastAPI Application (TRL-6)
Production Hardened & Fully Operational:
- Hardware Abstraction Layer (HAL): NI-DAQ IEPE & SAE J1939 CAN transceiver
- Synchronous Order Tracking (SOT): Computed Order Tracking for 1X, 2X, 4X firing orders
- ISO 10816-6 Engine Health Index (EHI) Calculator
- Gemini AI Root-Cause Diagnostic Agent
- Persistent Test-Run Database: SQLite (aiosqlite) / PostgreSQL (asyncpg)
- Telemetry Replay Engine: CSV upload, run history scrubbing & playback
- BEML Engineering Report Generator: PDF & CSV export
- 10 Hz Synchronized Multimodal WebSocket streaming (/ws/telemetry)
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from simulator.engine_sim import TatraEngineSimulator
from simulator.replay_engine import TelemetryReplayEngine
from dsp.pipeline import EngineDSPPipeline
from models.anomaly_detector import EngineAnomalyDetector
from models.health_index import EngineHealthIndexCalculator
from hal.manager import HALManager, DataSourceMode
from ai.local_diagnostics import LocalDiagnosticAgent
from database.models import TestRun, TelemetryRecord, DiagnosticEvent
from database.session import init_db, get_db, AsyncSessionLocal
from reports.generator import BEMLReportGenerator

# Structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("TatraTestbed")

# Core system singletons
simulator = TatraEngineSimulator(sample_rate=25600, buffer_duration=0.1)
replay_engine = TelemetryReplayEngine()
dsp_pipeline = EngineDSPPipeline(sample_rate=25600, n_fft_bins=256, n_waveform_points=256)
anomaly_detector = EngineAnomalyDetector()
health_index_calc = EngineHealthIndexCalculator(
    weight_vibration=0.35,
    weight_thermal=0.25,
    weight_lubrication=0.20,
    weight_combustion=0.20
)
hal_manager = HALManager(simulator=simulator)
diagnostics_agent = LocalDiagnosticAgent(mode="auto")

# Active Recording State
class RecordingManager:
    def __init__(self):
        self.is_recording: bool = False
        self.active_run_id: Optional[str] = None
        self.run_name: str = ""
        self.engine_serial: str = "TATRA-T3B-928-80-0419"
        self.operator_id: str = "TECH-BEML-01"
        self.start_time: Optional[datetime] = None
        
        # In-memory accumulators
        self.total_records: int = 0
        self.min_ehi: float = 100.0
        self.initial_ehi: float = 100.0
        self.max_rpm: float = 0.0
        self.min_eop: float = 5.0
        self.max_cht_delta: float = 0.0
        self.max_kurtosis_x: float = 3.0
        self.fault_detected: str = "none"
        self.buffer: List[Dict[str, Any]] = []
        self.lock = asyncio.Lock()

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_recording": self.is_recording,
            "active_run_id": self.active_run_id,
            "run_name": self.run_name,
            "engine_serial": self.engine_serial,
            "operator_id": self.operator_id,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "duration_seconds": round((datetime.now(timezone.utc) - self.start_time).total_seconds(), 1) if (self.start_time and self.is_recording) else 0.0,
            "total_records": self.total_records,
            "min_ehi": round(self.min_ehi, 1)
        }

recorder = RecordingManager()


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_json(self, data: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                self.disconnect(connection)

manager = ConnectionManager()
latest_processed_frame: Dict[str, Any] = {}
background_stream_task: Optional[asyncio.Task] = None
db_flush_task: Optional[asyncio.Task] = None


async def db_flush_worker():
    """
    Periodically flushes recorded telemetry buffer to database to maintain high performance.
    """
    while True:
        try:
            await asyncio.sleep(2.0)
            if not recorder.is_recording or not recorder.active_run_id:
                continue

            async with recorder.lock:
                to_save = list(recorder.buffer)
                recorder.buffer.clear()

            if to_save:
                async with AsyncSessionLocal() as session:
                    records = [
                        TelemetryRecord(
                            run_id=recorder.active_run_id,
                            timestamp=item["timestamp"],
                            rpm=item["rpm"],
                            torque=item["torque"],
                            power_kw=item["power_kw"],
                            load_pct=item["load_pct"],
                            eop=item["eop"],
                            eot=item["eot"],
                            cht1=item["cht1"],
                            cht2=item["cht2"],
                            cht_delta=item["cht_delta"],
                            boost=item["boost"],
                            vibration_rms_x=item["vibration_rms_x"],
                            vibration_rms_y=item["vibration_rms_y"],
                            kurtosis_x=item["kurtosis_x"],
                            kurtosis_y=item["kurtosis_y"],
                            order_1x=item["order_1x"],
                            order_2x=item["order_2x"],
                            order_4x=item["order_4x"],
                            bpfo_order=item["bpfo_order"],
                            ehi=item["ehi"],
                            anomaly_score=item["anomaly_score"],
                            active_fault=item["active_fault"]
                        )
                        for item in to_save
                    ]
                    session.add_all(records)
                    await session.commit()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error flushing telemetry buffer to database: {e}")


async def telemetry_streaming_worker():
    """
    Background worker running at 10 Hz (every 100 ms).
    Pulls from Replay Engine, HAL Hardware, or Simulator.
    Applies DSP, SOT, ISO 10816-6 EHI, and Anomaly Detection.
    Handles persistent recording and WebSocket broadcasting.
    """
    global latest_processed_frame
    logger.info("Starting 10 Hz multimodal telemetry streaming worker...")

    while True:
        try:
            # 1. Acquire raw multimodal frame
            if replay_engine.is_active:
                raw_frame = replay_engine.step()
                if raw_frame is None:
                    raw_frame = await hal_manager.read_frame()
            else:
                raw_frame = await hal_manager.read_frame()

            # 2. Process DSP (welch, time-domain, thermodynamic validation, and Synchronous Order Tracking)
            processed = dsp_pipeline.process_frame(raw_frame)

            # 3. Score Anomaly Detector
            anomaly_result = anomaly_detector.predict_frame(processed)

            # 4. Compute continuous ISO 10816-6 Engine Health Index (EHI)
            ehi_result = health_index_calc.calculate_ehi(processed)

            # 5. Handle Live Test-Run Recording
            if recorder.is_recording and recorder.active_run_id:
                state = processed["engine_state"]
                dsp = processed["dsp_features"]
                sot_x = dsp["radial_x"].get("order_tracking", {})
                sot_y = dsp["radial_y"].get("order_tracking", {})

                rpm_val = float(state.get("rpm", 0))
                eop_val = float(state.get("oil_pressure_bar", 0))
                cht_delta_val = float(state.get("cht_delta_c", 0))
                kurt_x_val = float(dsp["radial_x"]["time"]["kurtosis"])
                ehi_val = float(ehi_result["overall_ehi"])

                # Update aggregates
                recorder.total_records += 1
                recorder.max_rpm = max(recorder.max_rpm, rpm_val)
                recorder.min_eop = min(recorder.min_eop, eop_val)
                recorder.max_cht_delta = max(recorder.max_cht_delta, cht_delta_val)
                recorder.max_kurtosis_x = max(recorder.max_kurtosis_x, kurt_x_val)
                recorder.min_ehi = min(recorder.min_ehi, ehi_val)
                if state.get("active_fault", "none") != "none":
                    recorder.fault_detected = state.get("active_fault", "none")

                # Buffer record
                record_entry = {
                    "timestamp": processed["timestamp"],
                    "rpm": rpm_val,
                    "torque": float(state.get("torque_nm", 0)),
                    "power_kw": float(state.get("power_kw", 0)),
                    "load_pct": float(state.get("load_pct", 0)),
                    "eop": eop_val,
                    "eot": float(state.get("oil_temp_c", 0)),
                    "cht1": float(state.get("cht1_c", 0)),
                    "cht2": float(state.get("cht2_c", 0)),
                    "cht_delta": cht_delta_val,
                    "boost": float(state.get("boost_pressure_bar", 0)),
                    "vibration_rms_x": float(dsp["radial_x"]["time"]["rms"]),
                    "vibration_rms_y": float(dsp["radial_y"]["time"]["rms"]),
                    "kurtosis_x": kurt_x_val,
                    "kurtosis_y": float(dsp["radial_y"]["time"]["kurtosis"]),
                    "order_1x": float(sot_x.get("order_1x_peak", 0)),
                    "order_2x": float(sot_x.get("order_2x_peak", 0)),
                    "order_4x": float(sot_x.get("order_4x_firing_peak", 0)),
                    "bpfo_order": float(sot_x.get("bpfo_bearing_peak", 0)),
                    "ehi": ehi_val,
                    "anomaly_score": float(anomaly_result["anomaly_score"]),
                    "active_fault": state.get("active_fault", "none")
                }

                async with recorder.lock:
                    recorder.buffer.append(record_entry)

            # 6. Assemble complete payload
            telemetry_payload = {
                "timestamp": processed["timestamp"],
                "engine_state": processed["engine_state"],
                "dsp_features": processed["dsp_features"],
                "thermo_validation": processed["thermo_validation"],
                "anomaly": anomaly_result,
                "ehi": ehi_result,
                "stream_payload": processed["stream_payload"],
                "hal_status": hal_manager.get_status(),
                "replay_status": replay_engine.get_status(),
                "recording_status": recorder.get_status()
            }
            latest_processed_frame = telemetry_payload

            # 7. Broadcast via WebSocket
            if manager.active_connections:
                await manager.broadcast_json(telemetry_payload)

            # Interval adjusted for replay speed if applicable
            delay = 0.1
            if replay_engine.is_active and not replay_engine.is_paused:
                delay = 0.1 / max(0.25, replay_engine.playback_speed)
            await asyncio.sleep(delay)

        except asyncio.CancelledError:
            logger.info("Telemetry streaming worker cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in telemetry streaming worker: {e}", exc_info=True)
            await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_stream_task, db_flush_task
    logger.info("Initializing Tatra T3B-928 V8 Database & HAL...")
    await init_db()
    anomaly_detector.train_baseline_synthetic(n_samples=500)
    background_stream_task = asyncio.create_task(telemetry_streaming_worker())
    db_flush_task = asyncio.create_task(db_flush_worker())
    yield
    if background_stream_task:
        background_stream_task.cancel()
    if db_flush_task:
        db_flush_task.cancel()
    await hal_manager.disconnect()


app = FastAPI(
    title="Tatra T3B-928 V8 Predictive Maintenance Testbed API",
    description="TRL-6 Industrial Edge AI, Hardware Abstraction, SOT, ISO 10816-6 EHI, and Test Run Persistence",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request & Response Schemas
class FaultInjectionRequest(BaseModel):
    fault_type: str = Field(..., description="'none', 'bearing_flaw', 'cooling_imbalance', 'lubrication_degradation'")
    severity: float = Field(default=1.0, ge=0.0, le=1.0)


class OperatingPointRequest(BaseModel):
    rpm: Optional[float] = Field(None, ge=650.0, le=2200.0)
    load_pct: Optional[float] = Field(None, ge=0.0, le=100.0)


class SourceConfigRequest(BaseModel):
    mode: Literal["SIMULATOR", "HARDWARE"]


class StartRunRequest(BaseModel):
    run_name: str = Field(default="Operational Validation Run")
    engine_serial: str = Field(default="TATRA-T3B-928-80-0419")
    operator_id: str = Field(default="TECH-BEML-01")
    notes: Optional[str] = Field(default="")


class ReplayControlRequest(BaseModel):
    action: Literal["play", "pause", "resume", "seek", "speed", "stop"]
    value: Optional[float] = None


# -------------------------------------------------------------
# 1. System Health & HAL Endpoints
# -------------------------------------------------------------
@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    return {
        "status": "operational",
        "trl_level": "TRL-6 Full Operational Readiness",
        "engine_model": "Tatra T3B-928 V8 Air-Cooled Turbocharged Diesel",
        "crankcase_type": "Tunnel crankcase with cylindrical roller main bearings",
        "hal_status": hal_manager.get_status(),
        "replay_status": replay_engine.get_status(),
        "recording_status": recorder.get_status(),
        "is_baseline_trained": anomaly_detector.is_trained,
        "active_websocket_clients": len(manager.active_connections)
    }


@app.get("/api/config/source")
def get_data_source() -> Dict[str, Any]:
    return hal_manager.get_status()


@app.post("/api/config/source")
async def set_data_source(req: SourceConfigRequest) -> Dict[str, Any]:
    mode = DataSourceMode(req.mode)
    res = await hal_manager.switch_source(mode)
    return res


# -------------------------------------------------------------
# 2. Simulator, Operating Points & Baseline
# -------------------------------------------------------------
@app.post("/api/simulate/fault")
def inject_fault(req: FaultInjectionRequest) -> Dict[str, Any]:
    try:
        res = simulator.set_fault(req.fault_type, req.severity)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/simulate/operating_point")
def set_operating_point(req: OperatingPointRequest) -> Dict[str, Any]:
    res = simulator.set_operating_point(req.rpm, req.load_pct)
    return res


@app.post("/api/baseline/train")
def train_baseline() -> Dict[str, Any]:
    result = anomaly_detector.train_baseline_synthetic(n_samples=600)
    return result


@app.get("/api/telemetry/snapshot")
def get_telemetry_snapshot() -> Dict[str, Any]:
    if not latest_processed_frame:
        raise HTTPException(status_code=503, detail="Telemetry stream not initialized yet")
    return latest_processed_frame


# -------------------------------------------------------------
# 3. Gemini AI Diagnostics
# -------------------------------------------------------------
@app.post("/api/diagnostics/analyze")
async def run_diagnostics_analysis(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if not latest_processed_frame:
        raise HTTPException(status_code=503, detail="Telemetry stream not ready for diagnostics")

    analysis = await diagnostics_agent.analyze_snapshot(latest_processed_frame)

    # If currently recording, log DiagnosticEvent to database
    if recorder.is_recording and recorder.active_run_id:
        try:
            event = DiagnosticEvent(
                run_id=recorder.active_run_id,
                timestamp=time.time(),
                trigger_type="MANUAL_DIAGNOSTICS",
                ehi_at_trigger=float(latest_processed_frame.get("ehi", {}).get("overall_ehi", 100.0)),
                criticality=analysis.get("criticality", "MEDIUM"),
                component_affected=analysis.get("component_affected", "General Assembly"),
                root_cause_hypothesis=analysis.get("root_cause_hypothesis", ""),
                recommended_actions="; ".join(analysis.get("recommended_actions", []))
            )
            db.add(event)
            await db.commit()
        except Exception as e:
            logger.error(f"Failed to persist diagnostic event: {e}")

    return analysis


# -------------------------------------------------------------
# 4. Test-Run Management & Persistence (TRL-6)
# -------------------------------------------------------------
@app.post("/api/runs/start")
async def start_run(req: StartRunRequest, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if recorder.is_recording:
        raise HTTPException(status_code=400, detail="A test run is already currently recording.")

    run_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)
    current_ehi = float(latest_processed_frame.get("ehi", {}).get("overall_ehi", 100.0)) if latest_processed_frame else 100.0

    test_run = TestRun(
        id=run_id,
        engine_serial=req.engine_serial,
        run_name=req.run_name,
        operator_id=req.operator_id,
        start_time=start_time,
        initial_ehi=current_ehi,
        min_ehi=current_ehi,
        final_status="RECORDING",
        primary_fault="none",
        notes=req.notes or ""
    )

    db.add(test_run)
    await db.commit()

    # Activate in-memory recorder
    recorder.is_recording = True
    recorder.active_run_id = run_id
    recorder.run_name = req.run_name
    recorder.engine_serial = req.engine_serial
    recorder.operator_id = req.operator_id
    recorder.start_time = start_time
    recorder.total_records = 0
    recorder.initial_ehi = current_ehi
    recorder.min_ehi = current_ehi
    recorder.max_rpm = 0.0
    recorder.min_eop = 5.0
    recorder.max_cht_delta = 0.0
    recorder.max_kurtosis_x = 3.0
    recorder.fault_detected = "none"
    recorder.buffer.clear()

    logger.info(f"Started recording test run: {run_id} ({req.run_name})")
    return test_run.to_dict()


@app.post("/api/runs/stop")
async def stop_run(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if not recorder.is_recording or not recorder.active_run_id:
        raise HTTPException(status_code=400, detail="No active recording session to stop.")

    run_id = recorder.active_run_id
    end_time = datetime.now(timezone.utc)

    # Flush remaining buffer
    async with recorder.lock:
        to_save = list(recorder.buffer)
        recorder.buffer.clear()

    if to_save:
        records = [
            TelemetryRecord(
                run_id=run_id,
                timestamp=item["timestamp"],
                rpm=item["rpm"],
                torque=item["torque"],
                power_kw=item["power_kw"],
                load_pct=item["load_pct"],
                eop=item["eop"],
                eot=item["eot"],
                cht1=item["cht1"],
                cht2=item["cht2"],
                cht_delta=item["cht_delta"],
                boost=item["boost"],
                vibration_rms_x=item["vibration_rms_x"],
                vibration_rms_y=item["vibration_rms_y"],
                kurtosis_x=item["kurtosis_x"],
                kurtosis_y=item["kurtosis_y"],
                order_1x=item["order_1x"],
                order_2x=item["order_2x"],
                order_4x=item["order_4x"],
                bpfo_order=item["bpfo_order"],
                ehi=item["ehi"],
                anomaly_score=item["anomaly_score"],
                active_fault=item["active_fault"]
            )
            for item in to_save
        ]
        db.add_all(records)

    # Determine final verdict
    final_status = "PASSED"
    if recorder.min_ehi < 50.0 or recorder.fault_detected != "none":
        final_status = "CRITICAL"
    elif recorder.min_ehi < 70.0 or recorder.max_cht_delta > 25.0:
        final_status = "FLAGGED"

    # Update TestRun in database
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if test_run:
        test_run.end_time = end_time
        test_run.min_ehi = recorder.min_ehi
        test_run.final_status = final_status
        test_run.primary_fault = recorder.fault_detected
        test_run.total_records = recorder.total_records
        test_run.max_rpm = recorder.max_rpm
        test_run.min_eop = recorder.min_eop
        test_run.max_cht_delta = recorder.max_cht_delta
        test_run.max_kurtosis_x = recorder.max_kurtosis_x
        await db.commit()
        await db.refresh(test_run)
        res_dict = test_run.to_dict()
    else:
        res_dict = {"id": run_id, "status": final_status}

    recorder.is_recording = False
    recorder.active_run_id = None
    logger.info(f"Finalized test run: {run_id} (Status: {final_status})")
    return res_dict


@app.get("/api/runs")
async def list_runs(limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    query = select(TestRun).order_by(desc(TestRun.start_time)).limit(limit).offset(offset)
    result = await db.execute(query)
    runs = result.scalars().all()
    return {
        "runs": [r.to_dict() for r in runs],
        "active_recording": recorder.get_status()
    }


@app.get("/api/runs/{run_id}")
async def get_run_details(run_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if not test_run:
        raise HTTPException(status_code=404, detail="Test run not found")

    rec_result = await db.execute(
        select(TelemetryRecord).where(TelemetryRecord.run_id == run_id).order_by(TelemetryRecord.timestamp).limit(2000)
    )
    records = rec_result.scalars().all()

    diag_result = await db.execute(
        select(DiagnosticEvent).where(DiagnosticEvent.run_id == run_id).order_by(DiagnosticEvent.timestamp)
    )
    diagnostics = diag_result.scalars().all()

    return {
        "run": test_run.to_dict(),
        "telemetry_count": len(records),
        "telemetry_sample": [r.to_dict() for r in records[:300]],
        "diagnostic_events": [d.to_dict() for d in diagnostics]
    }


@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if not test_run:
        raise HTTPException(status_code=404, detail="Test run not found")

    await db.execute(delete(TestRun).where(TestRun.id == run_id))
    await db.commit()
    return {"status": "deleted", "id": run_id}


# -------------------------------------------------------------
# 5. Telemetry Replay Engine Endpoints
# -------------------------------------------------------------
@app.post("/api/runs/upload")
async def upload_csv_for_replay(file: UploadFile = File(...)) -> Dict[str, Any]:
    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
        status = replay_engine.load_csv(csv_text, filename=file.filename or "uploaded.csv")
        return {"status": "success", "replay": status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")


@app.post("/api/runs/{run_id}/replay")
async def start_historical_replay(run_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if not test_run:
        raise HTTPException(status_code=404, detail="Test run not found")

    rec_result = await db.execute(
        select(TelemetryRecord).where(TelemetryRecord.run_id == run_id).order_by(TelemetryRecord.timestamp).limit(3000)
    )
    records = [r.to_dict() for r in rec_result.scalars().all()]
    if not records:
        raise HTTPException(status_code=400, detail="Run has no recorded telemetry to replay.")

    status = replay_engine.load_from_records(run_id, records, run_name=test_run.run_name)
    return {"status": "success", "replay": status}


@app.post("/api/replay/control")
def control_replay(req: ReplayControlRequest) -> Dict[str, Any]:
    if req.action == "pause":
        return replay_engine.pause()
    elif req.action in ["play", "resume"]:
        return replay_engine.resume()
    elif req.action == "seek" and req.value is not None:
        return replay_engine.seek(req.value)
    elif req.action == "speed" and req.value is not None:
        return replay_engine.set_speed(req.value)
    elif req.action == "stop":
        return replay_engine.stop()
    return replay_engine.get_status()


@app.get("/api/replay/status")
def get_replay_status() -> Dict[str, Any]:
    return replay_engine.get_status()


# -------------------------------------------------------------
# 6. BEML Engineering Reports Export (PDF & CSV)
# -------------------------------------------------------------
@app.get("/api/runs/{run_id}/export/csv")
async def export_run_csv(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if not test_run:
        raise HTTPException(status_code=404, detail="Test run not found")

    rec_result = await db.execute(
        select(TelemetryRecord).where(TelemetryRecord.run_id == run_id).order_by(TelemetryRecord.timestamp)
    )
    records = [r.to_dict() for r in rec_result.scalars().all()]

    csv_data = BEMLReportGenerator.generate_csv(test_run.to_dict(), records)
    filename = f"BEML_TATRA_T3B928_{run_id[:8]}_{datetime.now().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/runs/{run_id}/export/pdf")
async def export_run_pdf(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestRun).where(TestRun.id == run_id))
    test_run = result.scalar_one_or_none()
    if not test_run:
        raise HTTPException(status_code=404, detail="Test run not found")

    rec_result = await db.execute(
        select(TelemetryRecord).where(TelemetryRecord.run_id == run_id).order_by(TelemetryRecord.timestamp).limit(2000)
    )
    records = [r.to_dict() for r in rec_result.scalars().all()]

    diag_result = await db.execute(
        select(DiagnosticEvent).where(DiagnosticEvent.run_id == run_id).order_by(DiagnosticEvent.timestamp)
    )
    diagnostics = [d.to_dict() for d in diag_result.scalars().all()]

    pdf_bytes = BEMLReportGenerator.generate_pdf(test_run.to_dict(), records, diagnostics)
    filename = f"BEML_Inspection_Report_{test_run.engine_serial}_{run_id[:8]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# -------------------------------------------------------------
# 7. WebSocket Telemetry Stream Endpoint
# -------------------------------------------------------------
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                if action == "set_fault":
                    simulator.set_fault(msg.get("fault_type", "none"), msg.get("severity", 1.0))
                elif action == "set_operating_point":
                    simulator.set_operating_point(msg.get("rpm"), msg.get("load_pct"))
                elif action == "retrain_baseline":
                    anomaly_detector.train_baseline_synthetic(n_samples=msg.get("n_samples", 500))
                elif action == "replay_control":
                    cmd = msg.get("cmd")
                    val = msg.get("value")
                    if cmd == "pause": replay_engine.pause()
                    elif cmd == "play": replay_engine.resume()
                    elif cmd == "seek" and val is not None: replay_engine.seek(val)
                    elif cmd == "speed" and val is not None: replay_engine.set_speed(val)
                    elif cmd == "stop": replay_engine.stop()
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
