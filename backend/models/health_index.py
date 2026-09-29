"""
ISO 10816-6 Compliant Engine Health Index (EHI) Calculator
Computes a continuous 0.0 to 100.0 multi-factor engineering health score
for the Tatra T3B-928 V8 air-cooled diesel powertrain.
"""

from typing import Dict, Any, Literal


class EngineHealthIndexCalculator:
    """
    Evaluates engine mechanical condition according to ISO 10816-6 (Reciprocating Machinery)
    and thermodynamic power balance.
    """

    def __init__(
        self,
        weight_vibration: float = 0.35,
        weight_thermal: float = 0.25,
        weight_lubrication: float = 0.20,
        weight_combustion: float = 0.20
    ):
        # Normalize weights to 1.0
        total_w = weight_vibration + weight_thermal + weight_lubrication + weight_combustion
        self.w_vib = weight_vibration / total_w
        self.w_therm = weight_thermal / total_w
        self.w_lube = weight_lubrication / total_w
        self.w_comb = weight_combustion / total_w

    def calculate(self, processed_frame: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates EHI and individual sub-scores from processed DSP and ECU telemetry.
        """
        dsp = processed_frame.get("dsp_features", {})
        thermo = processed_frame.get("thermo_validation", {})
        state = processed_frame.get("engine_state", {})

        rad_x = dsp.get("radial_x", {})
        rad_y = dsp.get("radial_y", {})
        cross = dsp.get("cross_axis", {})

        # --- A. Vibration Mechanical Score (35%) ---
        # ISO 10816-6 Zone Evaluation + Kurtosis Impulsive Shock Penalty
        x_rms = float(rad_x.get("time", {}).get("rms", 0.5))
        y_rms = float(rad_y.get("time", {}).get("rms", 0.5))
        max_rms = max(x_rms, y_rms)

        x_kurt = float(rad_x.get("time", {}).get("kurtosis", 3.0))
        y_kurt = float(rad_y.get("time", {}).get("kurtosis", 3.0))
        max_kurt = max(x_kurt, y_kurt)

        bpfo_peak = float(dsp.get("order_tracking", {}).get("radial_x_peaks", {}).get("amp_bpfo_g", 0.0))

        # Base vibration score
        vib_score = 100.0

        # ISO 10816-6 Zone classification for large reciprocating engines:
        # Zone A (New): RMS < 1.0g -> 95-100
        # Zone B (Good): RMS 1.0-1.8g -> 80-95
        # Zone C (Warning): RMS 1.8-3.0g -> 50-80
        # Zone D (Unacceptable): RMS > 3.0g -> < 50
        if max_rms <= 1.0:
            iso_zone = "Zone A (Nominal)"
        elif max_rms <= 1.8:
            iso_zone = "Zone B (Unrestricted Operation)"
            vib_score -= (max_rms - 1.0) * 20.0
        elif max_rms <= 3.0:
            iso_zone = "Zone C (Restricted / Warning)"
            vib_score -= 16.0 + (max_rms - 1.8) * 35.0
        else:
            iso_zone = "Zone D (Critical Vibration)"
            vib_score -= 58.0 + min(35.0, (max_rms - 3.0) * 15.0)

        # Kurtosis penalty (excess impulsiveness from spalls / roller impacts)
        if max_kurt > 3.5:
            kurt_excess = max_kurt - 3.5
            vib_score -= min(35.0, kurt_excess * 7.5)

        # BPFO bearing harmonic penalty
        if bpfo_peak > 0.15:
            vib_score -= min(25.0, (bpfo_peak - 0.15) * 80.0)

        vib_score = max(5.0, min(100.0, vib_score))

        # --- B. Thermal Balance Score (25%) ---
        # Air-cooled Cylinder Head Temperature balance & Oil thermal limits
        cht_delta = float(state.get("cht_delta_c", 2.0))
        oil_temp = float(state.get("oil_temp_c", 92.0))

        therm_score = 100.0
        if cht_delta > 12.0:
            # Bank differential penalty
            therm_score -= min(55.0, (cht_delta - 12.0) * 2.2)

        if oil_temp > 105.0:
            therm_score -= min(40.0, (oil_temp - 105.0) * 2.5)

        therm_score = max(5.0, min(100.0, therm_score))

        # --- C. Lubrication Health Score (20%) ---
        # Oil pressure vs dynamic speed envelope
        eop_deficit = float(thermo.get("eop_deficit_bar", 0.0))
        eop = float(state.get("oil_pressure_bar", 3.5))

        lube_score = 100.0
        if eop_deficit > 0.0:
            lube_score -= min(75.0, eop_deficit * 45.0)
        if eop < 1.8:
            lube_score -= 20.0

        lube_score = max(5.0, min(100.0, lube_score))

        # --- D. Volumetric / Combustion Efficiency (20%) ---
        # Turbocharger boost pressure and power verification
        load_pct = float(state.get("load_pct", 40.0))
        boost = float(state.get("boost_pressure_bar", 1.4))

        comb_score = 100.0
        if load_pct > 50.0 and boost < 1.25:
            comb_score -= min(50.0, (1.25 - boost) * 80.0)

        comb_score = max(10.0, min(100.0, comb_score))

        # --- Composite EHI ---
        overall_ehi = (
            self.w_vib * vib_score +
            self.w_therm * therm_score +
            self.w_lube * lube_score +
            self.w_comb * comb_score
        )
        overall_ehi = round(max(0.0, min(100.0, overall_ehi)), 1)

        # Status categorization
        if overall_ehi >= 80.0:
            status: Literal["HEALTHY", "DEGRADED", "CRITICAL"] = "HEALTHY"
        elif overall_ehi >= 60.0:
            status = "DEGRADED"
        else:
            status = "CRITICAL"

        # Identify primary stressor
        sub_scores = {
            "vibration": round(vib_score, 1),
            "thermal": round(therm_score, 1),
            "lubrication": round(lube_score, 1),
            "combustion": round(comb_score, 1)
        }

        min_sub = min(sub_scores, key=sub_scores.get)
        stressor_map = {
            "vibration": "Crankcase Roller Bearing Impulsive Shocks (ISO Zone Stress)",
            "thermal": "Cylinder Head Bank Thermal Asymmetry (CHT Imbalance)",
            "lubrication": "Hydrodynamic Oil Pressure Deficit & Thermal Thinning",
            "combustion": "Turbocharger Boost Under-Pressure at Load"
        }
        primary_stressor = stressor_map[min_sub] if sub_scores[min_sub] < 85.0 else "None (Nominal Machine Envelope)"

        return {
            "overall_ehi": overall_ehi,
            "status": status,
            "iso_10816_zone": iso_zone,
            "sub_scores": sub_scores,
            "primary_stressor": primary_stressor,
            "weights": {
                "vibration": round(self.w_vib, 2),
                "thermal": round(self.w_therm, 2),
                "lubrication": round(self.w_lube, 2),
                "combustion": round(self.w_comb, 2)
            }
        }
