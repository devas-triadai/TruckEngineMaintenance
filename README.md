# Tatra T3B-928 V8 Predictive Maintenance Testbed (TRL-4)

Industrial IoT, Signal Processing, and Edge AI predictive maintenance application for the heavy-duty **Tatra 8x8 truck engine** (Tatra T3B-928 V8 air-cooled diesel).

---

## 1. Engine & Testbed Architecture

| Subsystem | Engineering Specification |
| :--- | :--- |
| **Engine Model** | Tatra T3B-928-70 / T3B-928-80 (Euro 3/Euro 4) |
| **Configuration** | 90° V8, Air-Cooled, Direct Injection, Twin Turbocharged with Intercoolers |
| **Displacement** | 12,667 cm³ (Bore: 120 mm, Stroke: 140 mm) |
| **Power & Torque** | 300–325 kW (408–442 hp) @ 1,800 RPM; 1,450–1,550 N·m @ 1,200–1,400 RPM |
| **Crankcase** | **Tunnel Crankcase**: solid cast bulkhead with monolithic cylindrical roller bearings supporting the assembled crankshaft |
| **Cylinder Heads** | Individual ribbed light-alloy cylinder heads per cylinder with separate cooling shrouds |
| **Cooling** | Front-mounted engine-driven hydraulic cooling blower fan with proportional PWM bypass valve |
| **Biaxial Vibration** | Synchronous 25.6 kS/s piezoelectric accelerometers: Radial-X (horizontal) and Radial-Y (vertical) |
| **ECU Protocol** | SAE J1939 CAN bus telemetry (RPM: SPN 190, EOP: SPN 100, EOT: SPN 175, Torque: SPN 92, Boost: SPN 102) |

---

## 2. Signal Processing & Anomaly Detection Pipeline

### A. Digital Signal Processing (DSP)
- **Sampling Frequency**: $F_s = 25,600\text{ Hz}$ ($25.6\text{ kS/s}$)
- **Time-Domain Feature Extraction**:
  - Root Mean Square (RMS)
  - Peak and Peak-to-Peak ($V_{p-p}$)
  - Crest Factor ($C_f = \frac{V_{peak}}{V_{rms}}$)
  - Pearson Kurtosis ($\kappa = \frac{\mathbb{E}[(x-\mu)^4]}{\sigma^4}$, sensitive to impulsive bearing shock pulses)
  - Skewness
- **Frequency-Domain Order Tracking**:
  - Fundamental rotating shaft frequency: $f_0 = \frac{\text{RPM}}{60}$
  - Cylinder firing order frequency (4 firings/rev for 4-stroke V8): $f_{\text{firing}} = 4 \times f_0$
  - Ball Pass Frequency Outer Race (BPFO) for tunnel roller bearings: $\approx 3.58 \times f_0$
  - High-frequency demodulation band: $2,000\text{ Hz} - 8,000\text{ Hz}$

### B. Thermodynamic Physical Laws Validation
1. **Oil Pressure vs RPM Dynamic Envelope**: Verifies hydrodynamic lubrication pressure against minimum speed threshold ($P_{\text{oil}} \ge 1.4 + 2.5 \times \frac{\text{RPM}}{2100}\text{ bar}$).
2. **CHT Bank Thermal Differential**: Verifies Left Bank (CHT1) vs Right Bank (CHT2) delta ($\Delta T \le 18^\circ\text{C}$ normal; $>30^\circ\text{C}$ critical cooling shutter failure).
3. **Brake Power Conservation**: Checks $P_{\text{kW}} = \frac{\tau \times \text{RPM}}{9549}$.
4. **Turbo Boost Pressure Sanity**: Checks charge-air boost pressure under varying engine loads.

### C. Unsupervised Edge AI Anomaly Detection
- **Algorithm**: Multi-dimensional Isolation Forest trained on healthy engine manifold points across the full operational envelope ($700 - 2,100\text{ RPM}$, $0 - 100\%\text{ load}$).
- **Continuous Anomaly Score**: Scaled to $[0.000, 1.000]$ ($0.0 = \text{nominal}$, $\ge 0.52 = \text{alarm}$).
- **Explainable Feature Attribution**: Computes $z$-score deviations against healthy baseline distributions to rank root-cause contributors (e.g. *Radial-X Impulsive Kurtosis (+4.2σ)*).

---

## 3. Dynamic Fault Injection Modes

| Fault Mode | Mechanical Root Cause | Observable Physical Symptoms |
| :--- | :--- | :--- |
| **Bearing Flaw** | Roller bearing outer race spall on tunnel bulkhead | Sharp Kurtosis surge ($>6.0$), high Crest Factor, transient shock pulses at BPFO frequency in $3.2\text{ kHz}$ resonant band. |
| **Cooling Imbalance** | Hydraulic blower duct debris blockage or sticking bank vane | Right Bank CHT2 diverges from Left Bank CHT1 ($\Delta T > 30^\circ\text{C}$), fan hydraulic valve hits 100% saturation. |
| **Lubrication Degradation** | Oil pump relief bypass stuck or viscosity breakdown | Oil pressure plummets below $1.8\text{ bar}$ under load, oil temperature surges past $120^\circ\text{C}$, increased scuffing noise. |

---

## 4. Quickstart Guide (Local Execution)

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
*Backend API docs available at: `http://localhost:8000/docs`*

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

## 5. API Reference

- `GET /api/health` — System status, calibration state, active fault.
- `POST /api/simulate/fault` — Inject fault: `{"fault_type": "bearing_flaw" | "cooling_imbalance" | "lubrication_degradation" | "none", "severity": 0.0 - 1.0}`.
- `POST /api/simulate/operating_point` — Set RPM and Load: `{"rpm": 1400, "load_pct": 65}`.
- `POST /api/baseline/train` — Retrain baseline Isolation Forest on synthetic operating envelope.
- `GET /api/telemetry/snapshot` — Instantaneous multimodal frame snapshot.
- `WS /ws/telemetry` — 10 Hz synchronized WebSocket streaming raw waveforms, FFT, DSP metrics, ECU status, and anomaly scores.
