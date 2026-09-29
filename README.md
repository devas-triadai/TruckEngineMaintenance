# Tatra T3B-928 V8 Predictive Maintenance Testbed (TRL-5)

Industrial IoT, Signal Processing, and Edge AI predictive maintenance application for the heavy-duty **Tatra 8x8 truck engine** (Tatra T3B-928 V8 air-cooled diesel), upgraded to **TRL-5 (Component Validation in Relevant/Testbed Environment)**.

---

## 1. TRL-5 Architecture & Subsystems

| Subsystem | Engineering Specification |
| :--- | :--- |
| **Engine Architecture** | Tatra T3B-928 90° V8, Air-Cooled, Direct Injection, Twin Turbocharged with Intercoolers |
| **Displacement & Output** | 12,667 cm³; 325 kW (442 hp) @ 1,800 RPM; 1,550 N·m @ 1,300 RPM |
| **Crankcase & Bearings** | Monolithic **Tunnel Crankcase** with cylindrical roller main bearings |
| **Cylinder Heads** | Individual finned alloy cylinder heads (Bank 1: LH cyl 1–4; Bank 2: RH cyl 5–8) |
| **Cooling** | Front engine-driven hydraulic cooling fan with proportional PWM bypass valve |
| **Hardware Abstraction Layer (HAL)** | Runtime switchable: Physical **NI-DAQ IEPE Accelerometers** (25.6/51.2 kS/s) + **SAE J1939 CAN transceiver** (SocketCAN/PCAN) vs. Physics Engine Simulator |
| **Synchronous Order Tracking (DSP)** | Computed Order Tracking (COT) via angular-domain resampling $\theta(t) = \int 2\pi f_0 dt$ extracting 1X, 2X, 4X V8 firing, and BPFO orders |
| **Engine Health Index (EHI)** | Multi-factor continuous scoring (0.0 to 100.0) compliant with **ISO 10816-6** (Reciprocating Machinery) |
| **AI Root-Cause Diagnostics** | **Gemini 3.8 Flash** via official Google GenAI SDK (`google-genai`) generating structured root-cause hypotheses and prescriptive technician checklists |

---

## 2. Hardware Abstraction Layer (HAL)

The testbed features a dual-mode HAL architecture with dynamic runtime switching via `POST /api/config/source`:

### A. NI-DAQ IEPE Accelerometer Driver (`backend/hal/ni_daq.py`)
- Channels: `ai0` (Radial-X on front crankcase bulkhead) and `ai1` (Radial-Y on main bearing saddle crown).
- Excitation: 4 mA constant current excitation (24V compliance), AC coupling, and hardware anti-aliasing.
- Automatic Fallback: If NI-DAQmx drivers or C-Series hardware are absent on the host OS, it logs an informative notice and yields synchronous simulated frames with zero crash risk.

### B. SAE J1939 CAN Transceiver (`backend/hal/can_bus.py`)
- Protocol: J1939 250 kbps / 500 kbps over SocketCAN (`can0`, `vcan0`), PEAK-System PCAN-USB, or Kvaser.
- Decoded PGNs:
  - **PGN 61444 (EEC1)**: SPN 190 (Engine Speed RPM), SPN 92 (Engine Percent Load)
  - **PGN 65263 (EFL_P1)**: SPN 100 (Engine Oil Pressure EOP)
  - **PGN 65262 (ET1)**: SPN 175 (Engine Oil Temperature EOT)
  - **PGN 65270 (IC1)**: SPN 102 (Intake Manifold Boost Pressure)

---

## 3. Synchronous Order Tracking (DSP) & ISO 10816-6 EHI

### A. Angular-Domain Computed Order Tracking (`backend/dsp/order_tracking.py`)
Standard FFT suffers from spectral smearing during throttle transitions. Synchronous Order Tracking solves this by resampling $x(t) \to x(\theta)$ where $\theta(t) = \int 2\pi f_0(t) dt$:
- **1X Order**: Crankshaft fundamental rotating unbalance ($f_0 = \frac{\text{RPM}}{60}$).
- **2X Order**: Second-order angular asymmetry / shaft misalignment ($2 \times f_0$).
- **4X Order**: Tatra V8 four-stroke cylinder firing frequency (4 firings per crankshaft revolution = $4 \times f_0$).
- **BPFO Order**: Ball Pass Frequency Outer Race on tunnel roller main bearing ($\approx 3.58 \times f_0$).

### B. Continuous ISO 10816-6 Engine Health Index (`backend/models/health_index.py`)
Computes an objective, continuous 0.0 to 100.0 health metric based on four weighted pillars:
$$\text{EHI} = 0.35 \cdot S_{\text{vib}} + 0.25 \cdot S_{\text{therm}} + 0.20 \cdot S_{\text{lube}} + 0.20 \cdot S_{\text{comb}}$$
- **Vibration Score ($S_{\text{vib}}$)**: ISO 10816-6 Zone classification (Zone A/B/C/D), Kurtosis impulsiveness penalty ($\kappa > 3.5$), and BPFO bearing defect order surge.
- **Thermal Balance Score ($S_{\text{therm}}$)**: Left Bank CHT1 vs Right Bank CHT2 differential penalty ($\Delta T > 12^\circ\text{C}$) and oil sump thermal limits ($> 105^\circ\text{C}$).
- **Lubrication Health Score ($S_{\text{lube}}$)**: Hydrodynamic oil pressure dynamic envelope deficit ($P_{\text{oil}} \ge 1.4 + 2.5 \cdot \frac{\text{RPM}}{2100}\text{ bar}$).
- **Combustion Efficiency Score ($S_{\text{comb}}$)**: Turbocharger boost pressure correlation under dynamometer load.

---

## 4. Gemini AI Diagnostics Integration (`backend/ai/gemini_diagnostics.py`)

Powered by the Google GenAI SDK (`google-genai`):
- Model: `gemini-3.8-flash` with structured JSON schema.
- Input: Multimodal snapshot containing EHI sub-scores, J1939 ECU metrics, synchronous order peaks, and active fault states.
- Output:
  - `root_cause_hypothesis`: Engineering diagnosis of physical degradation.
  - `criticality`: `LOW` | `MEDIUM` | `HIGH` | `IMMEDIATE_SHUTDOWN`.
  - `component_affected`: Specific assembly (e.g. *Front Tunnel Roller Bearing #1 Bulkhead*).
  - `recommended_actions`: Prescriptive step-by-step mechanical technician inspection checklist.

---

## 5. Quickstart & Local Execution

### Option A: Standard Local Virtualenv + Node

#### 1. Start the Python FastAPI Backend:
```bash
# Navigate to repository root
cd /path/to/tatra-v8-testbed

# Create virtual environment and activate
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server with WebSockets
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend Swagger API docs available at: `http://localhost:8000/docs`*

#### 2. Start the React 18 + Vite Frontend Dashboard:
```bash
# In a separate terminal at repository root:
npm install
npm run dev
```
*Frontend opens at: `http://localhost:3000`*

---

### Option B: Docker Compose (One-Click)

```bash
docker-compose up --build
```
- Frontend UI: `http://localhost:3000`
- FastAPI Backend & WebSocket: `http://localhost:8000`
- WebSocket stream endpoint: `ws://localhost:8000/ws/telemetry`

---

## 6. REST API Reference (TRL-5)

- `GET /api/health` — Full subsystem health, TRL-5 status, active fault, and driver statuses.
- `GET /api/config/source` — Inquire current DAQ hardware status (NI-DAQ IEPE & CAN).
- `POST /api/config/source` — Toggle DAQ acquisition source: `{"source_mode": "SIMULATOR" | "HARDWARE"}`.
- `POST /api/diagnostics/analyze` — Trigger Google GenAI root-cause diagnostic synthesis.
- `POST /api/simulate/fault` — Inject fault: `{"fault_type": "bearing_flaw" | "cooling_imbalance" | "lubrication_degradation" | "none", "severity": 0.0 - 1.0}`.
- `POST /api/simulate/operating_point` — Set RPM and Load: `{"rpm": 1400, "load_pct": 65}`.
- `POST /api/baseline/train` — Retrain baseline Isolation Forest on synthetic operating envelope.
- `GET /api/telemetry/snapshot` — Instantaneous multimodal frame snapshot.
- `WS /ws/telemetry` — 10 Hz synchronized WebSocket streaming raw waveforms, FFT, Synchronous Order Tracking peaks, ISO 10816-6 EHI, and anomaly metrics.
