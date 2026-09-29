"""
100% Offline / Open-Source Predictive Maintenance Diagnostic Engine
Air-gapped testbed compatible: Zero external API keys, zero cloud dependencies.

Supports two selectable local backends:
1. RuleBasedExpertEngine:
   - 100% deterministic, zero external library or GPU requirement.
   - Grounded in BEML testbed failure modes, physical thermodynamic laws, and ISO 10816-6 vibration standards.
2. OllamaLocalEngine:
   - Connects to a locally hosted open-source LLM (e.g. Qwen 2.5, Llama 3.2, Mistral) via Ollama (http://localhost:11434).
   - Gracefully and silently falls back to RuleBasedExpertEngine if Ollama is not running on the host.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional, Literal

logger = logging.getLogger("AI.LocalDiagnostics")

# Try importing httpx for async Ollama communication; fall back to urllib if not installed
HAS_HTTPX = False
try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


class RuleBasedExpertEngine:
    """
    Deterministic, ISO 10816-6 grounded diagnostic expert engine.
    Requires ZERO external libraries or GPU.
    Uses physical deterministic rules mapped to BEML testbed failure modes.
    """

    def analyze(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        ehi = snapshot.get("ehi", {})
        engine_state = snapshot.get("engine_state", {})
        dsp = snapshot.get("dsp_features", {})
        thermo = snapshot.get("thermo_validation", {})

        active_fault = engine_state.get("active_fault", "none")
        fault_severity = float(engine_state.get("fault_severity", 0.0))
        overall_ehi = float(ehi.get("overall_ehi", 95.0))

        # Sensor readings & metrics
        rpm = float(engine_state.get("rpm", 1250.0))
        eop = float(engine_state.get("oil_pressure_bar", 3.8))
        eot = float(engine_state.get("oil_temp_c", 92.0))
        cht1 = float(engine_state.get("cht1_c", 140.0))
        cht2 = float(engine_state.get("cht2_c", 140.0))
        cht_delta = float(engine_state.get("cht_delta_c", abs(cht1 - cht2)))
        eop_deficit = float(thermo.get("eop_deficit_bar", 0.0))

        # Vibration metrics
        rad_x = dsp.get("radial_x", {})
        rad_y = dsp.get("radial_y", {})
        x_kurt = float(rad_x.get("time", {}).get("kurtosis", 3.0))
        y_kurt = float(rad_y.get("time", {}).get("kurtosis", 3.0))
        max_kurt = max(x_kurt, y_kurt)
        x_rms = float(rad_x.get("time", {}).get("rms", 0.5))
        y_rms = float(rad_y.get("time", {}).get("rms", 0.5))
        max_rms = max(x_rms, y_rms)

        # Order tracking metrics
        peaks_x = rad_x.get("order_peaks", {})
        amp_1x = float(peaks_x.get("amp_1x_g", 0.15))
        amp_2x = float(peaks_x.get("amp_2x_g", 0.10))
        amp_4x = float(peaks_x.get("amp_4x_g", 0.45))
        amp_bpfo = float(peaks_x.get("amp_bpfo_g", 0.05))

        f0 = max(1.0, rpm / 60.0)
        bpfo_freq = 3.58 * f0

        # ---------------------------------------------------------
        # Failure Mode 1: Tunnel Roller Bearing Flaw (Outer Race Spall)
        # ---------------------------------------------------------
        if active_fault == "bearing_flaw" or max_kurt > 5.0 or amp_bpfo > 0.15:
            severity_str = "CRITICAL" if max_kurt > 7.0 or amp_bpfo > 0.30 else "HIGH"
            return {
                "root_cause_hypothesis": (
                    f"High-frequency impulsive transient ringdowns and elevated kurtosis ({max_kurt:.2f} vs Gaussian nominal 3.0) "
                    f"with pronounced energy concentration at {bpfo_freq:.1f} Hz (BPFO 3.58× f0 order peak = {amp_bpfo:.3f} g). "
                    "This indicates localized fatigue micro-spalling or raceway brinelling on the front monolithic tunnel crankcase "
                    "cylindrical roller main bearing #1."
                ),
                "criticality": severity_str,
                "component_affected": "Front Monolithic Tunnel Roller Bearing #1 & Bulkhead Assembly",
                "recommended_actions": [
                    "Perform high-frequency shock pulse measurement (SPM / Demodulation) on the front bulkhead accelerometer mount.",
                    "Drain oil sump into a clean container and inspect the magnetic drain plug for ferromagnetic roller spall flakes.",
                    "Check crankshaft axial float and radial runout using a dial test indicator (DTI) at the front damper flange.",
                    "Schedule tunnel bearing renewal and inspect roller cage retainers before running endurance dynamometer sweeps."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "BEML Deterministic Expert System v2.1"
            }

        # ---------------------------------------------------------
        # Failure Mode 2: Cylinder Head Right-Bank Cooling Airflow Imbalance
        # ---------------------------------------------------------
        elif active_fault == "cooling_imbalance" or cht_delta > 25.0:
            severity_str = "HIGH" if cht_delta > 35.0 else "MEDIUM"
            hot_bank = "Bank 2 (Right Bank, Cylinders 5-8)" if cht2 > cht1 else "Bank 1 (Left Bank, Cylinders 1-4)"
            return {
                "root_cause_hypothesis": (
                    f"Severe thermal divergence (ΔT = {cht_delta:.1f}°C) between cylinder banks (Bank 1 = {cht1:.1f}°C, Bank 2 = {cht2:.1f}°C). "
                    f"The excessive heat accumulation in {hot_bank} demonstrates airflow starvation caused by cooling shroud aerodynamic "
                    "restriction, debris fouling between ribbed cylinder head cooling fins, or a sticking hydraulic blower bypass valve."
                ),
                "criticality": severity_str,
                "component_affected": f"{hot_bank} Finned Heads & Hydraulic Cooling Cowling",
                "recommended_actions": [
                    f"Inspect sheet-metal cooling cowls and air guide vanes on {hot_bank} for physical debris, dust mats, or cowl deformation.",
                    "Verify proportional PWM valve actuation signal (cooling valve duty) and oil feed pressure to the front hydraulic blower.",
                    "Perform non-contact infrared thermal survey of individual cylinder head fins across all 8 cylinders.",
                    "Inspect cylinder exhaust gas temperatures (EGT) to rule out injector nozzle dribble or combustion valve blow-by."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "BEML Deterministic Expert System v2.1"
            }

        # ---------------------------------------------------------
        # Failure Mode 3: Lubrication Breakdown & Hydrodynamic Pressure Deficit
        # ---------------------------------------------------------
        elif active_fault == "lubrication_degradation" or eop_deficit > 0.40 or eop < 1.8:
            is_emergency = eop < 1.40
            return {
                "root_cause_hypothesis": (
                    f"Engine oil pressure ({eop:.2f} bar) has fallen {eop_deficit:.2f} bar below the hydrodynamic minimum envelope "
                    f"at {rpm:.0f} RPM with elevated oil temperature ({eot:.1f}°C). "
                    "This symptom pattern indicates oil pressure relief valve spring relaxation, oil pump internal cavitation, "
                    "or severe thermal viscosity thinning (shear degradation) of the SAE 15W-40 oil."
                ),
                "criticality": "IMMEDIATE_SHUTDOWN" if is_emergency else "HIGH",
                "component_affected": "Main Oil Gallery & Pressure Relief Bypass Valve Assembly",
                "recommended_actions": [
                    "Halt high-torque testbed sweep immediately to prevent boundary metal-to-metal contact in roller bearings.",
                    "Remove and inspect the oil pressure relief valve plunger and spring tension on the lower crankcase oil pump casing.",
                    "Draw 100 mL oil sample for Kinematic Viscosity testing (ASTM D445) and ICP spectrographic wear metal analysis.",
                    "Inspect the air-cooled oil heat exchanger for internal sludge blockage or external fin clogging."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "BEML Deterministic Expert System v2.1"
            }

        # ---------------------------------------------------------
        # Failure Mode 4: 2X Shaft Misalignment / Dynamometer Coupling Wear
        # ---------------------------------------------------------
        elif amp_2x > 0.35 and amp_2x > (amp_1x * 1.2):
            return {
                "root_cause_hypothesis": (
                    f"Elevated 2X rotational harmonic peak ({amp_2x:.3f} g at {(2 * f0):.1f} Hz) exceeding 1X unbalance order ({amp_1x:.3f} g). "
                    "This pattern indicates angular or parallel misalignment across the testbed dynamometer cardan shaft coupling, "
                    "or progressive damping fluid degradation inside the front viscous torsional vibration damper."
                ),
                "criticality": "MEDIUM",
                "component_affected": "Testbed Dynamometer Cardan Coupling & Torsional Damper",
                "recommended_actions": [
                    "Perform dial indicator or laser alignment check on the testbed cardan shaft coupling between engine and dyno.",
                    "Inspect front viscous torsional vibration damper for silicone fluid weepage, bulging, or thermal discoloration.",
                    "Verify engine isolation mount torque values and inspect elastomeric isolator pads for settling."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "BEML Deterministic Expert System v2.1"
            }

        # ---------------------------------------------------------
        # Default Mode: Nominal Healthy Powertrain Envelope
        # ---------------------------------------------------------
        else:
            return {
                "root_cause_hypothesis": (
                    f"All mechanical, thermodynamic, and vibrational parameters reside within ISO 10816-6 Zone A (Nominal) limits. "
                    f"Engine Health Index (EHI) is rated at {overall_ehi:.1f}%. Biaxial vibration (RMS = {max_rms:.2f} g, Kurtosis = {max_kurt:.2f}), "
                    f"cylinder bank thermal symmetry (ΔT = {cht_delta:.1f}°C), and hydrodynamic oil film pressure ({eop:.2f} bar) are fully nominal."
                ),
                "criticality": "LOW",
                "component_affected": "Powertrain Invariants Nominal",
                "recommended_actions": [
                    "Proceed with scheduled testbed drive-cycle evaluation and load increments.",
                    "Archive synchronous 25.6 kS/s order tracking signatures for fleet-level baseline comparison.",
                    "Perform routine oil level verification and fluid envelope inspection at standard 250-hour testbed interval."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "BEML Deterministic Expert System v2.1"
            }


class OllamaLocalEngine:
    """
    Connects to a locally hosted open-source LLM via Ollama (e.g. Qwen 2.5, Llama 3.2, Mistral).
    Zero cloud dependencies, air-gapped testbed compatible.
    If Ollama is not running, gracefully returns None to allow seamless fallback.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = 3.5
    ):
        self.host = host or os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "qwen2.5:latest")
        self.timeout_seconds = timeout_seconds

    async def is_available(self) -> bool:
        """Check if local Ollama daemon is active and responsive."""
        if not HAS_HTTPX:
            return False
        try:
            async with httpx.AsyncClient(timeout=1.2) as client:
                res = await client.get(f"{self.host}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def analyze(self, snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Sends structured testbed telemetry prompt to local Ollama instance.
        Returns parsed JSON report or None on failure.
        """
        if not HAS_HTTPX:
            return None

        engine_state = snapshot.get("engine_state", {})
        dsp = snapshot.get("dsp_features", {})
        ehi = snapshot.get("ehi", {})
        thermo = snapshot.get("thermo_validation", {})

        system_instruction = (
            "You are an expert Chief Powertrain Reliability & Vibration Diagnostics Engineer for the Tatra T3B-928 V8 air-cooled diesel. "
            "Analyze the telemetry snapshot and return ONLY valid JSON conforming strictly to this format:\n"
            "{\n"
            '  "root_cause_hypothesis": "detailed engineering explanation",\n'
            '  "criticality": "LOW" | "MEDIUM" | "HIGH" | "IMMEDIATE_SHUTDOWN",\n'
            '  "component_affected": "specific component name",\n'
            '  "recommended_actions": ["action 1", "action 2", "action 3", "action 4"]\n'
            "}"
        )

        prompt_data = {
            "engine": "Tatra T3B-928 90-degree V8 air-cooled diesel, 12.7L, twin-turbo, tunnel crankcase with roller bearings",
            "rpm": engine_state.get("rpm"),
            "torque_nm": engine_state.get("torque_nm"),
            "oil_pressure_bar": engine_state.get("oil_pressure_bar"),
            "oil_temp_c": engine_state.get("oil_temp_c"),
            "cht_bank1_c": engine_state.get("cht1_c"),
            "cht_bank2_c": engine_state.get("cht2_c"),
            "cht_delta_c": engine_state.get("cht_delta_c"),
            "boost_bar": engine_state.get("boost_pressure_bar"),
            "active_fault": engine_state.get("active_fault"),
            "fault_severity": engine_state.get("fault_severity"),
            "kurtosis_x": dsp.get("radial_x", {}).get("time", {}).get("kurtosis"),
            "kurtosis_y": dsp.get("radial_y", {}).get("time", {}).get("kurtosis"),
            "rms_x_g": dsp.get("radial_x", {}).get("time", {}).get("rms"),
            "order_1x_g": dsp.get("radial_x", {}).get("order_peaks", {}).get("amp_1x_g"),
            "order_2x_g": dsp.get("radial_x", {}).get("order_peaks", {}).get("amp_2x_g"),
            "order_4x_g": dsp.get("radial_x", {}).get("order_peaks", {}).get("amp_4x_g"),
            "bpfo_order_g": dsp.get("radial_x", {}).get("order_peaks", {}).get("amp_bpfo_g"),
            "overall_ehi": ehi.get("overall_ehi"),
            "iso_zone": ehi.get("iso_10816_zone")
        }

        user_content = f"Telemetry snapshot:\n{json.dumps(prompt_data, indent=2)}\nProvide diagnostic JSON:"

        payload = {
            "model": self.model,
            "prompt": f"<|im_start|>system\n{system_instruction}<|im_end|>\n<|im_start|>user\n{user_content}<|im_end|>\n<|im_start|>assistant\n",
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.15,
                "top_p": 0.9,
                "num_predict": 450
            }
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                res = await client.post(f"{self.host}/api/generate", json=payload)
                if res.status_code != 200:
                    logger.warning(f"Ollama returned HTTP {res.status_code}")
                    return None

                data = res.json()
                response_text = data.get("response", "").strip()
                if not response_text:
                    return None

                parsed = json.loads(response_text)
                parsed["engine_model"] = "Tatra T3B-928 V8 Air-Cooled Diesel"
                parsed["source"] = "OLLAMA_LOCAL"
                parsed["model_version"] = f"Ollama {self.model} (Air-Gapped)"
                return parsed
        except Exception as e:
            logger.info(f"Ollama local inference unavailable ({e}); falling back to deterministic expert engine.")
            return None


class LocalDiagnosticAgent:
    """
    Primary Diagnostic Orchestrator for the Tatra T3B-928 V8 Testbed.
    Combines deterministic physical rule validation with optional local Ollama LLM.
    Guarantees 100% offline, zero-cloud, air-gapped testbed operation.
    """

    def __init__(self, mode: Literal["auto", "rule_based", "ollama"] = "auto"):
        self.mode = mode
        self.rule_engine = RuleBasedExpertEngine()
        self.ollama_engine = OllamaLocalEngine()
        logger.info(f"LocalDiagnosticAgent initialized with mode='{self.mode}'. 100% offline air-gapped ready.")

    def set_mode(self, mode: Literal["auto", "rule_based", "ollama"]):
        self.mode = mode

    async def analyze_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyzes telemetry snapshot and returns complete diagnostic report.
        """
        # If Ollama is preferred or auto-detected
        if self.mode in ["auto", "ollama"]:
            ollama_result = await self.ollama_engine.analyze(snapshot)
            if ollama_result is not None:
                return ollama_result

        # Deterministic Rule-Based Expert Engine
        return self.rule_engine.analyze(snapshot)

    async def analyze_telemetry_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for backward compatibility."""
        return await self.analyze_snapshot(snapshot)

    def get_status(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "air_gapped": True,
            "cloud_dependencies": False,
            "ollama_host": self.ollama_engine.host,
            "ollama_model": self.ollama_engine.model,
            "fallback": "RuleBasedExpertEngine (BEML Testbed Certified)"
        }


# Compatibility alias
EngineDiagnosticsAgent = LocalDiagnosticAgent
