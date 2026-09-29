"""
Gemini AI Predictive Maintenance Diagnostics Agent
Integrates the Google GenAI SDK to generate structured root-cause analyses,
criticality evaluations, and prescriptive technician inspection protocols for the
Tatra T3B-928 V8 air-cooled diesel powertrain.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("AI.Diagnostics")

# Try importing the modern google-genai SDK
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except (ImportError, Exception) as e:
    HAS_GENAI_SDK = False
    logger.warning(f"google-genai SDK not available ({e}). Rule-based fallback diagnostics active.")


class EngineDiagnosticsAgent:
    """
    Expert Diagnostic Agent for the Tatra T3B-928 V8 diesel engine.
    Uses Gemini 3.8 Flash with structured schema to interpret multimodal
    vibration orders, ISO 10816-6 EHI scores, and SAE J1939 sensor deviations.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.client = None
        self.model_name = "gemini-3.8-flash"

        if HAS_GENAI_SDK and self.api_key:
            try:
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options={'headers': {'User-Agent': 'aistudio-build'}}
                )
                logger.info(f"Gemini Diagnostics Agent initialized with model '{self.model_name}'.")
            except Exception as ex:
                logger.warning(f"Could not initialize Gemini Client: {ex}")

    async def analyze_telemetry_snapshot(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits instantaneous multimodal telemetry to Gemini and returns structured root-cause report.
        """
        # Extract telemetry context
        ehi = snapshot.get("ehi", {})
        engine_state = snapshot.get("engine_state", {})
        dsp = snapshot.get("dsp_features", {})
        thermo = snapshot.get("thermo_validation", {})
        anomaly = snapshot.get("anomaly", {})

        # If Gemini client is not configured, use the deterministic rule engine
        if not self.client:
            return self._generate_rule_based_diagnostics(snapshot)

        prompt_context = f"""
You are an expert Chief Powertrain Reliability and Vibration Diagnostics Engineer specializing in heavy-duty Tatra 8x8 military/mining trucks powered by the Tatra T3B-928 V8 air-cooled diesel engine.

ENGINE ARCHITECTURE & SPECS:
- 90° V8 direct-injection air-cooled diesel (12.7L displacement, twin-turbo with intercoolers).
- Tunnel crankcase with monolithic cylindrical roller main bearings (assembled crankshaft).
- Individual finned light-alloy cylinder heads (Bank 1: Left cyl 1-4; Bank 2: Right cyl 5-8).
- Front-mounted engine-driven hydraulic cooling blower fan with proportional PWM bypass valve.
- Synchronous biaxial accelerometers at 25.6 kS/s: Radial-X (horizontal bulkhead), Radial-Y (bearing crown).

CURRENT OPERATING POINT & TESTBED TELEMETRY:
- Engine Speed: {engine_state.get('rpm', 1200)} RPM | Torque: {engine_state.get('torque_nm', 500)} N·m | Power: {engine_state.get('power_kw', 100)} kW
- Engine Oil Pressure (EOP, SPN 100): {engine_state.get('oil_pressure_bar', 3.5)} bar (Minimum envelope requirement: {thermo.get('min_expected_eop_bar', 2.8)} bar)
- Engine Oil Temperature (EOT, SPN 175): {engine_state.get('oil_temp_c', 90)} °C
- Cylinder Head Temperatures: Bank 1 (Left) = {engine_state.get('cht1_c', 135)} °C, Bank 2 (Right) = {engine_state.get('cht2_c', 135)} °C, Differential ΔT = {engine_state.get('cht_delta_c', 0)} °C
- Turbo Boost Pressure (SPN 102): {engine_state.get('boost_pressure_bar', 1.4)} bar | Blower Fan PWM: {engine_state.get('cooling_valve_pct', 45)}%
- Active Testbed Injected Fault Mode: {engine_state.get('active_fault', 'none')} (Severity: {engine_state.get('fault_severity', 0.0)})

VIBRATION & ORDER TRACKING METRICS:
- Radial-X Kurtosis: {dsp.get('radial_x', {}).get('time', {}).get('kurtosis', 3.0)} (Baseline Gaussian: 3.0)
- Radial-Y Kurtosis: {dsp.get('radial_y', {}).get('time', {}).get('kurtosis', 3.0)}
- Radial-X RMS: {dsp.get('radial_x', {}).get('time', {}).get('rms', 0.5)} g | Radial-Y RMS: {dsp.get('radial_y', {}).get('time', {}).get('rms', 0.5)} g
- Synchronous Order Peaks: 1X = {dsp.get('radial_x', {}).get('order_peaks', {}).get('amp_1x_g', 0.2)}g, 2X = {dsp.get('radial_x', {}).get('order_peaks', {}).get('amp_2x_g', 0.1)}g, 4X (V8 Firing Order) = {dsp.get('radial_x', {}).get('order_peaks', {}).get('amp_4x_g', 0.5)}g, BPFO (Roller Bearing Spall) = {dsp.get('radial_x', {}).get('order_peaks', {}).get('amp_bpfo_g', 0.05)}g

ISO 10816-6 HEALTH INDEX (EHI):
- Overall EHI: {ehi.get('overall_ehi', 95.0)} / 100.0 (Status: {ehi.get('status', 'HEALTHY')})
- ISO 10816-6 Zone: {ehi.get('iso_10816_zone', 'Zone A')}
- Sub-Scores: Vibration: {ehi.get('sub_scores', {}).get('vibration', 95)}, Thermal: {ehi.get('sub_scores', {}).get('thermal', 95)}, Lubrication: {ehi.get('sub_scores', {}).get('lubrication', 95)}, Combustion: {ehi.get('sub_scores', {}).get('combustion', 95)}
- Primary Stressor: {ehi.get('primary_stressor', 'None')}

Provide an authoritative engineering diagnostic assessment in valid JSON conforming to the requested schema.
"""

        try:
            response = self.client.models.generateContent(
                model=self.model_name,
                contents=prompt_context,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    system_instruction=(
                        "You are an expert Chief Powertrain Reliability and Vibration Diagnostics Engineer for the Tatra T3B-928 V8 diesel engine. "
                        "Analyze the multimodal telemetry and return concise, actionable root cause hypotheses, ISO 10816-6 severity ratings, and specific step-by-step testbed maintenance actions in JSON."
                    ),
                    temperature=0.2,
                )
            )

            report = json.loads(response.text.strip())
            report["engine_model"] = "Tatra T3B-928 V8 Air-Cooled Diesel"
            report["source"] = "GEMINI_AI"
            report["model_version"] = self.model_name
            return report
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}. Falling back to rule-based diagnostics.")
            return self._generate_rule_based_diagnostics(snapshot)

    def _generate_rule_based_diagnostics(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic, ISO 10816-6 grounded diagnostic expert engine.
        Ensures robust 24/7 testbed functionality even during network isolation.
        """
        ehi = snapshot.get("ehi", {})
        engine_state = snapshot.get("engine_state", {})
        dsp = snapshot.get("dsp_features", {})
        thermo = snapshot.get("thermo_validation", {})
        active_fault = engine_state.get("active_fault", "none")

        overall_ehi = ehi.get("overall_ehi", 95.0)
        x_kurt = float(dsp.get("radial_x", {}).get("time", {}).get("kurtosis", 3.0))
        cht_delta = float(engine_state.get("cht_delta_c", 2.0))
        eop_deficit = float(thermo.get("eop_deficit_bar", 0.0))

        if active_fault == "bearing_flaw" or x_kurt > 5.0:
            return {
                "root_cause_hypothesis": (
                    f"High-frequency impulsive transient ringdowns and elevated kurtosis ({x_kurt:.1f} vs nominal 3.0) "
                    "indicate localized spalling or fatigue pitting on the outer raceway of the front tunnel crankcase cylindrical roller main bearing (BPFO order excitation at 3.58× f0)."
                ),
                "criticality": "HIGH" if x_kurt > 6.5 else "MEDIUM",
                "component_affected": "Front Monolithic Tunnel Roller Bearing #1",
                "recommended_actions": [
                    "Perform high-frequency demodulation / shock pulse measurement (SPM) on front bulkhead mount.",
                    "Inspect crankcase magnetic drain plug for ferromagnetic roller spall debris.",
                    "Check crankshaft end-play and axial float using a dial test indicator (DTI).",
                    "Schedule bearing replacement before running endurance dynamic load cycles."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "Deterministic ISO 10816-6 Expert Twin"
            }

        elif active_fault == "cooling_imbalance" or cht_delta > 25.0:
            return {
                "root_cause_hypothesis": (
                    f"Cylinder head thermal divergence (ΔT = {cht_delta:.1f}°C between Left Bank and Right Bank) "
                    "indicates air-cooling shroud aerodynamic restriction, debris clogging in cooling fins, or sticking hydraulic blower directional vane flap on Bank 2."
                ),
                "criticality": "HIGH" if cht_delta > 35.0 else "MEDIUM",
                "component_affected": "Right Bank Cylinder Heads & Cooling Shrouding",
                "recommended_actions": [
                    "Inspect sheet-metal cooling cowls on Bank 2 (cylinders 5–8) for physical debris or shroud deformation.",
                    "Verify proportional PWM valve actuation and oil pressure feed to the front hydraulic cooling fan.",
                    "Use infrared pyrometer to audit individual cylinder head fin temperatures across both banks.",
                    "Check exhaust gas temperature (EGT) balance to rule out individual injector nozzle dribble."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "Deterministic ISO 10816-6 Expert Twin"
            }

        elif active_fault == "lubrication_degradation" or eop_deficit > 0.5:
            return {
                "root_cause_hypothesis": (
                    f"Engine oil pressure ({engine_state.get('oil_pressure_bar', 2.0)} bar) is lagging the hydrodynamic RPM requirement "
                    f"with high oil temperature ({engine_state.get('oil_temp_c', 100)}°C), indicating pressure relief valve spring fatigue or severe oil viscosity shear thinning."
                ),
                "criticality": "IMMEDIATE_SHUTDOWN" if engine_state.get("oil_pressure_bar", 2.0) < 1.4 else "HIGH",
                "component_affected": "Main Oil Gallery & Pressure Relief Bypass Valve",
                "recommended_actions": [
                    "Halt high-torque testbed sweep to prevent boundary lubrication contact in roller assemblies.",
                    "Inspect oil pressure relief valve plunger and spring tension on oil pump casing.",
                    "Draw 100 mL oil sample for Kinematic Viscosity (ASTM D445) and spectrographic wear metal analysis.",
                    "Inspect oil cooler interchanger for internal oil-to-air restriction."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "Deterministic ISO 10816-6 Expert Twin"
            }

        else:
            return {
                "root_cause_hypothesis": (
                    f"All mechanical and thermodynamic parameters are within ISO 10816-6 Zone A/B limits. "
                    f"Composite Health Index is {overall_ehi:.1f}%. Biaxial vibration, cylinder bank thermal symmetry, and hydrodynamic lubrication satisfy baseline operational envelopes."
                ),
                "criticality": "LOW",
                "component_affected": "Powertrain Invariants Nominal",
                "recommended_actions": [
                    "Continue standard testbed drive-cycle evaluation.",
                    "Log 25.6 kS/s baseline vibration spectrum for fleet trend analysis.",
                    "Audit oil pressure dynamic envelope at scheduled 250-hour test interval."
                ],
                "engine_model": "Tatra T3B-928 V8 Air-Cooled Diesel",
                "source": "RULE_BASED_EXPERT",
                "model_version": "Deterministic ISO 10816-6 Expert Twin"
            }
