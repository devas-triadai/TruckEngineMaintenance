"""
Tatra T3B-928 V8 Predictive Maintenance Testbed - FastAPI Application
Provides REST endpoints for fault injection & baseline calibration,
and a high-speed WebSocket (/ws/telemetry) streaming 10 Hz synchronized frames.
"""

import asyncio
import json
import logging
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator.engine_sim import TatraEngineSimulator
from dsp.pipeline import EngineDSPPipeline
from models.anomaly_detector import EngineAnomalyDetector

# Configure structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("TatraTestbed")

# Global system components
simulator = TatraEngineSimulator(sample_rate=25600, buffer_duration=0.1)
dsp_pipeline = EngineDSPPipeline(sample_rate=25600, n_fft_bins=256, n_waveform_points=256)
anomaly_detector = EngineAnomalyDetector()

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
    Advances engine simulation, executes DSP pipeline, scores with anomaly detector,
    and broadcasts to connected WebSocket clients.
    """
    global latest_processed_frame
    logger.info("Starting 10 Hz multimodal telemetry streaming worker...")
    while True:
        try:
            # 1. Step simulation (generates 2560 vibration samples and ECU thermodynamic values)
            raw_frame = simulator.step()
            
            # 2. Execute DSP and Thermodynamic Validation
            processed = dsp_pipeline.process_frame(raw_frame)
            
            # 3. Score with Unsupervised Baseline Anomaly Detector
            anomaly_result = anomaly_detector.predict_frame(processed)
            
            # 4. Construct unified telemetry package
            telemetry_payload = {
                "timestamp": processed["timestamp"],
                "engine_state": processed["engine_state"],
                "dsp_features": processed["dsp_features"],
                "thermo_validation": processed["thermo_validation"],
                "anomaly": anomaly_result,
                "stream_payload": processed["stream_payload"]
            }
            latest_processed_frame = telemetry_payload
            
            # 5. Broadcast to connected WebSocket clients if any
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
    # Pre-train baseline on startup
    logger.info("Training initial baseline anomaly detector on synthetic nominal engine manifold...")
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


app = FastAPI(
    title="Tatra T3B-928 V8 Predictive Maintenance Testbed API",
    description="Synchronous Biaxial Vibration DSP, SAE J1939 ECU Telemetry & Edge AI Anomaly Detection",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite development & cross-origin dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Models
class FaultInjectionRequest(BaseModel):
    fault_type: str = Field(..., description="'none', 'bearing_flaw', 'cooling_imbalance', 'lubrication_degradation'")
    severity: float = Field(default=1.0, ge=0.0, le=1.0, description="Severity from 0.0 (off) to 1.0 (extreme)")


class OperatingPointRequest(BaseModel):
    rpm: Optional[float] = Field(None, ge=650.0, le=2200.0, description="Engine RPM (650 - 2200)")
    load_pct: Optional[float] = Field(None, ge=0.0, le=100.0, description="Engine Load Percentage (0 - 100%)")


class TrainBaselineRequest(BaseModel):
    n_samples: int = Field(default=600, ge=100, le=5000, description="Number of baseline training samples across RPM/Load manifold")


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """
    Returns system status, active fault mode, and baseline model status.
    """
    return {
        "status": "operational",
        "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
        "crankcase_type": "Tunnel crankcase with cylindrical roller main bearings",
        "vibration_sampling_rate_hz": simulator.sample_rate,
        "active_fault": simulator.active_fault,
        "fault_severity": simulator.fault_severity,
        "is_baseline_trained": anomaly_detector.is_trained,
        "active_websocket_clients": len(manager.active_connections)
    }


@app.post("/api/simulate/fault")
def inject_fault(req: FaultInjectionRequest) -> Dict[str, Any]:
    """
    Injects or clears an engine fault mode dynamically.
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
    Adjusts target engine RPM and mechanical load percentage.
    """
    res = simulator.set_operating_point(req.rpm, req.load_pct)
    return res


@app.post("/api/baseline/train")
def train_baseline(req: TrainBaselineRequest) -> Dict[str, Any]:
    """
    Retrains the unsupervised Isolation Forest baseline on nominal operating conditions.
    """
    result = anomaly_detector.train_baseline_synthetic(n_samples=req.n_samples)
    logger.info(f"Retrained baseline anomaly detector with {req.n_samples} samples.")
    return result


@app.get("/api/telemetry/snapshot")
def get_telemetry_snapshot() -> Dict[str, Any]:
    """
    Returns the latest instantaneous processed telemetry frame.
    """
    if not latest_processed_frame:
        raise HTTPException(status_code=503, detail="Telemetry stream not initialized yet")
    return latest_processed_frame


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    High-speed WebSocket streaming 10 Hz synchronized multimodal frames:
    - Downsampled biaxial waveforms (Radial-X, Radial-Y)
    - Welch PSD / FFT spectrum bins with rotational order peaks
    - Time-domain indicators (RMS, Kurtosis, Crest Factor, P2P)
    - Thermodynamic sanity validation
    - Isolation Forest Anomaly Score & feature contributions
    """
    await manager.connect(websocket)
    try:
        # Keep connection open and accept incoming command messages if any
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
