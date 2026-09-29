"""
Tatra T3B-928 V8 Predictive Maintenance Testbed - FastAPI Application (TRL-5)
Integrates:
- Hardware Abstraction Layer (HAL): NI-DAQ IEPE & SAE J1939 CAN transceiver
- Synchronous Order Tracking (SOT): 1X, 2X, 4X V8 cylinder firing order peaks
- ISO 10816-6 Engine Health Index (EHI) Calculator
- Gemini AI Root-Cause Diagnostic Agent
- 10 Hz WebSocket streaming (/ws/telemetry)
"""

import asyncio
import json
import logging
from typing import Dict, Any, List, Optional, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator.engine_sim import TatraEngineSimulator
from dsp.pipeline import EngineDSPPipeline
from models.anomaly_detector import EngineAnomalyDetector
from models.health_index import EngineHealthIndexCalculator
from hal.manager import HALManager
from ai.gemini_diagnostics import EngineDiagnosticsAgent

# Structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("TatraTestbed")

# Core system components
simulator = TatraEngineSimulator(sample_rate=25600, buffer_duration=0.1)
dsp_pipeline = EngineDSPPipeline(sample_rate=25600, n_fft_bins=256, n_waveform_points=256)
anomaly_detector = EngineAnomalyDetector()
health_index_calc = EngineHealthIndexCalculator(
    weight_vibration=0.35,
    weight_thermal=0.25,
    weight_lubrication=0.20,
    weight_combustion=0.20
)
hal_manager = HALManager(simulator=simulator)
diagnostics_agent = EngineDiagnosticsAgent()

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
                logger.warning(f"Error broadcasting to client, removing: {e}")
                self.disconnect(connection)

manager = ConnectionManager()
latest_processed_frame: Dict[str, Any] = {}
background_stream_task: Optional[asyncio.Task] = None


async def telemetry_streaming_worker():
    """
    Background worker running at 10 Hz (every 100 ms).
    Acquires raw frames from HAL (Simulator or Real NI-DAQ + J1939 CAN),
    runs DSP pipeline + Synchronous Order Tracking, computes ISO 10816-6 EHI,
    runs Isolation Forest anomaly prediction, and broadcasts over WebSocket.
    """
    global latest_processed_frame
    logger.info("Starting 10 Hz TRL-5 multimodal telemetry streaming worker...")
    while True:
        try:
            # 1. Acquire multimodal frame via HAL Manager
            raw_frame = await hal_manager.acquire_multimodal_frame()
            
            # 2. Execute DSP Pipeline (Time-domain, Welch PSD, and Synchronous Order Tracking)
            processed = dsp_pipeline.process_frame(raw_frame)
            
            # 3. Calculate ISO 10816-6 Compliant Engine Health Index (EHI)
            ehi_result = health_index_calc.calculate(processed)
            
            # 4. Score with Unsupervised Baseline Anomaly Detector
            anomaly_result = anomaly_detector.predict_frame(processed)
            
            # 5. Construct unified telemetry package
            telemetry_payload = {
                "timestamp": processed["timestamp"],
                "source": raw_frame.get("source", "SIMULATOR"),
                "engine_state": processed["engine_state"],
                "dsp_features": processed["dsp_features"],
                "thermo_validation": processed["thermo_validation"],
                "ehi": ehi_result,
                "anomaly": anomaly_result,
                "stream_payload": processed["stream_payload"]
            }
            latest_processed_frame = telemetry_payload
            
            # 6. Broadcast to connected WebSocket clients
            if manager.active_connections:
                await manager.broadcast_json(telemetry_payload)
                
            await asyncio.sleep(0.1)  # 10 Hz
        except asyncio.CancelledError:
            logger.info("Telemetry streaming worker cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in telemetry streaming worker: {e}", exc_info=True)
            await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_stream_task
    logger.info("Initializing TRL-5 Testbed subsystems...")
    # Initialize HAL drivers
    await hal_manager.initialize()
    # Pre-train baseline on startup
    anomaly_detector.train_baseline_synthetic(n_samples=500)
    # Start background telemetry generator
    background_stream_task = asyncio.create_task(telemetry_streaming_worker())
    yield
    # Shutdown
    if background_stream_task:
        background_stream_task.cancel()
        try:
            await background_stream_task
        except asyncio.CancelledError:
            pass
    await hal_manager.shutdown()


app = FastAPI(
    title="Tatra T3B-928 V8 Predictive Maintenance Testbed API (TRL-5)",
    description="Synchronous Order Tracking, ISO 10816-6 EHI, HAL (NI-DAQ/CAN), and Gemini AI Diagnostics",
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Models
class SourceModeRequest(BaseModel):
    source_mode: Literal["SIMULATOR", "HARDWARE"] = Field(..., description="'SIMULATOR' or 'HARDWARE'")


class FaultInjectionRequest(BaseModel):
    fault_type: str = Field(..., description="'none', 'bearing_flaw', 'cooling_imbalance', 'lubrication_degradation'")
    severity: float = Field(default=1.0, ge=0.0, le=1.0, description="Severity from 0.0 to 1.0")


class OperatingPointRequest(BaseModel):
    rpm: Optional[float] = Field(None, ge=650.0, le=2200.0, description="Engine RPM (650 - 2200)")
    load_pct: Optional[float] = Field(None, ge=0.0, le=100.0, description="Engine Load % (0 - 100%)")


class TrainBaselineRequest(BaseModel):
    n_samples: int = Field(default=600, ge=100, le=5000, description="Number of baseline training samples")


# --- REST ENDPOINTS ---

@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """
    Returns system status, active fault mode, HAL source, and baseline calibration state.
    """
    return {
        "status": "operational",
        "trl_level": "TRL-5 (Component Validation in Relevant/Testbed Environment)",
        "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
        "crankcase_type": "Tunnel crankcase with cylindrical roller main bearings",
        "hal_status": hal_manager.get_source_status(),
        "active_fault": simulator.active_fault,
        "fault_severity": simulator.fault_severity,
        "is_baseline_trained": anomaly_detector.is_trained,
        "gemini_agent_active": diagnostics_agent.client is not None,
        "active_websocket_clients": len(manager.active_connections)
    }


@app.get("/api/config/source")
def get_source_configuration() -> Dict[str, Any]:
    """
    Returns current DAQ ingestion source configuration and driver handles.
    """
    return hal_manager.get_source_status()


@app.post("/api/config/source")
async def set_source_configuration(req: SourceModeRequest) -> Dict[str, Any]:
    """
    Switches DAQ source between 'SIMULATOR' and 'HARDWARE' (NI-DAQ IEPE + J1939 CAN).
    """
    try:
        res = await hal_manager.set_source_mode(req.source_mode)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/simulate/fault")
def inject_fault(req: FaultInjectionRequest) -> Dict[str, Any]:
    """
    Dynamically injects or clears failure modes.
    """
    try:
        res = simulator.set_fault(req.fault_type, req.severity)
        logger.info(f"Injected fault: {req.fault_type} (severity: {req.severity})")
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/simulate/operating_point")
def set_operating_point(req: OperatingPointRequest) -> Dict[str, Any]:
    """
    Adjusts target RPM and load percentage on the dynamometer.
    """
    res = simulator.set_operating_point(req.rpm, req.load_pct)
    return res


@app.post("/api/baseline/train")
def train_baseline(req: TrainBaselineRequest) -> Dict[str, Any]:
    """
    Retrains the Isolation Forest baseline on nominal operating envelope points.
    """
    result = anomaly_detector.train_baseline_synthetic(n_samples=req.n_samples)
    logger.info(f"Retrained baseline anomaly detector with {req.n_samples} samples.")
    return result


@app.get("/api/telemetry/snapshot")
def get_telemetry_snapshot() -> Dict[str, Any]:
    """
    Returns the latest instantaneous multimodal telemetry snapshot.
    """
    if not latest_processed_frame:
        raise HTTPException(status_code=503, detail="Telemetry stream not initialized yet")
    return latest_processed_frame


@app.post("/api/diagnostics/analyze")
async def trigger_diagnostics_analysis() -> Dict[str, Any]:
    """
    Invokes the Gemini Diagnostics Agent to produce a structured root-cause analysis
    and prescriptive technician inspection recommendations based on the current multimodal snapshot.
    """
    if not latest_processed_frame:
        raise HTTPException(status_code=503, detail="No active telemetry available to analyze")

    report = await diagnostics_agent.analyze_telemetry_snapshot(latest_processed_frame)
    return report


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    High-speed WebSocket streaming 10 Hz synchronized multimodal frames:
    - Downsampled biaxial waveforms (Radial-X, Radial-Y)
    - Synchronous Order Tracking peaks (1X, 2X, 4X, BPFO)
    - ISO 10816-6 Engine Health Index (EHI) and sub-scores
    - Welch PSD / FFT spectrum bins
    - Thermodynamic sanity validation
    - Anomaly detection & feature attribution
    """
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
                elif action == "set_source_mode":
                    await hal_manager.set_source_mode(msg.get("source_mode", "SIMULATOR"))
                elif action == "retrain_baseline":
                    anomaly_detector.train_baseline_synthetic(n_samples=msg.get("n_samples", 500))
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
