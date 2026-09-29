"""
Digital Signal Processing (DSP) & Thermodynamic Validation Pipeline
Processes synchronous biaxial vibration signals (25.6 kS/s) and SAE J1939 ECU parameters
for the Tatra T3B-928 V8 diesel engine testbed.
"""

import math
import numpy as np
from scipy import signal
from scipy.stats import kurtosis, skew
from typing import Dict, Any, List, Tuple
from .order_tracking import SynchronousOrderTracker


class EngineDSPPipeline:
    def __init__(self, sample_rate: int = 25600, n_fft_bins: int = 256, n_waveform_points: int = 256):
        """
        :param sample_rate: Sampling frequency in Hz (25600 Hz)
        :param n_fft_bins: Number of output frequency spectrum bins for dashboard streaming
        :param n_waveform_points: Downsampled points for time-domain oscilloscope streaming
        """
        self.sample_rate = sample_rate
        self.n_fft_bins = n_fft_bins
        self.n_waveform_points = n_waveform_points
        self.order_tracker = SynchronousOrderTracker(sample_rate=sample_rate)
        self.last_rpm: float = 1250.0

    @staticmethod
    def compute_time_domain_metrics(sig: np.ndarray) -> Dict[str, float]:
        """
        Computes standard industrial vibration time-domain indicators:
        RMS, Peak, Peak-to-Peak, Crest Factor, Kurtosis, Skewness.
        """
        n = len(sig)
        if n == 0:
            return {
                "rms": 0.0, "peak": 0.0, "peak_to_peak": 0.0,
                "crest_factor": 0.0, "kurtosis": 3.0, "skewness": 0.0
            }

        mean_val = float(np.mean(sig))
        std_val = float(np.std(sig))
        peak_val = float(np.max(np.abs(sig)))
        p2p_val = float(np.max(sig) - np.min(sig))
        rms_val = float(np.sqrt(np.mean(sig ** 2)))
        
        # Crest Factor = 0-to-Peak / RMS
        crest_factor = float(peak_val / (rms_val + 1e-6))
        
        # Kurtosis: Fisher kurtosis = 0 for normal, Pearson kurtosis = 3 for normal.
        # We report Pearson kurtosis (baseline Gaussian = 3.0, bearing shock pulses >> 5.0).
        kurt_val = float(kurtosis(sig, fisher=False)) if std_val > 1e-5 else 3.0
        skew_val = float(skew(sig)) if std_val > 1e-5 else 0.0

        return {
            "rms": round(rms_val, 3),
            "peak": round(peak_val, 3),
            "peak_to_peak": round(p2p_val, 3),
            "crest_factor": round(crest_factor, 2),
            "kurtosis": round(kurt_val, 2),
            "skewness": round(skew_val, 3)
        }

    def compute_spectral_features(self, sig: np.ndarray, rpm: float) -> Tuple[Dict[str, float], List[Dict[str, float]]]:
        """
        Computes Welch's Power Spectral Density (PSD), dominant frequency,
        and rotational order harmonic energy bands (1X, 2X, 4X V8 firing, and 2-8 kHz bearing band).
        """
        f0 = max(1.0, rpm / 60.0)  # Shaft rotating frequency in Hz
        
        # Welch PSD estimation
        nperseg = min(len(sig), 1024)
        freqs, psd = signal.welch(sig, fs=self.sample_rate, nperseg=nperseg, scaling='spectrum')
        
        # Amplitude spectrum in g (or mm/s equivalent)
        amp_spectrum = np.sqrt(psd * 2.0)
        
        # Dominant frequency
        dom_idx = int(np.argmax(amp_spectrum[1:])) + 1  # Skip DC bin
        dom_freq = float(freqs[dom_idx]) if dom_idx < len(freqs) else 0.0
        dom_amp = float(amp_spectrum[dom_idx]) if dom_idx < len(amp_spectrum) else 0.0
        
        def band_energy(f_low: float, f_high: float) -> float:
            idx = np.where((freqs >= f_low) & (freqs <= f_high))[0]
            if len(idx) == 0:
                return 0.0
            return float(np.sqrt(np.sum(amp_spectrum[idx] ** 2)))
        
        # Order-tracked energy bands
        sub_sync_energy = band_energy(0.1 * f0, 0.8 * f0)
        e_1x = band_energy(0.9 * f0, 1.1 * f0)  # Shaft fundamental
        e_2x = band_energy(1.9 * f0, 2.1 * f0)  # Secondary harmonic
        e_4x = band_energy(3.8 * f0, 4.2 * f0)  # V8 Firing order harmonic
        e_hf_bearing = band_energy(2000.0, 8000.0)  # High-frequency bearing defect zone
        
        spectral_metrics = {
            "f0_shaft_hz": round(f0, 2),
            "f4_firing_hz": round(4.0 * f0, 2),
            "dominant_freq_hz": round(dom_freq, 1),
            "dominant_amp_g": round(dom_amp, 3),
            "energy_sub_sync": round(sub_sync_energy, 3),
            "energy_1x": round(e_1x, 3),
            "energy_2x": round(e_2x, 3),
            "energy_4x": round(e_4x, 3),
            "energy_hf_bearing": round(e_hf_bearing, 3)
        }
        
        # Downsample frequency spectrum up to 8 kHz for front-end rendering
        max_display_freq = 6000.0
        display_mask = freqs <= max_display_freq
        disp_freqs = freqs[display_mask]
        disp_amps = amp_spectrum[display_mask]
        
        step = max(1, len(disp_freqs) // self.n_fft_bins)
        fft_points = []
        for i in range(0, len(disp_freqs), step):
            fft_points.append({
                "freq": round(float(disp_freqs[i]), 1),
                "amp": round(float(disp_amps[i]), 4),
                "db": round(float(20.0 * np.log10(max(1e-4, disp_amps[i]))), 1)
            })
            if len(fft_points) >= self.n_fft_bins:
                break
                
        return spectral_metrics, fft_points

    @staticmethod
    def validate_thermodynamics(engine_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates engine physical laws and identifies thermal/fluid discrepancies:
        1. EOP vs RPM: Hydrodynamic pressure must increase with RPM.
        2. CHT Bank Differential: Left bank (CHT1) vs Right bank (CHT2) delta <= 18°C normal.
        3. Mechanical Brake Power: P = (Torque * RPM) / 9549 kW.
        4. Turbo Boost vs Load correlation.
        """
        rpm = float(engine_state.get("rpm", 1000.0))
        torque = float(engine_state.get("torque_nm", 0.0))
        eop = float(engine_state.get("oil_pressure_bar", 3.0))
        eot = float(engine_state.get("oil_temp_c", 90.0))
        cht1 = float(engine_state.get("cht1_c", 130.0))
        cht2 = float(engine_state.get("cht2_c", 130.0))
        load_pct = float(engine_state.get("load_pct", 0.0))
        boost = float(engine_state.get("boost_pressure_bar", 1.0))
        
        # 1. Physical Power calculation check
        expected_power_kw = (torque * rpm) / 9549.0
        
        # 2. Oil pressure vs speed rule
        # Tatra positive displacement pump requires minimum:
        # Idle (700 RPM): >= 1.6 bar, Max speed (2100 RPM): >= 4.2 bar
        min_expected_eop = 1.4 + 2.5 * (rpm / 2100.0)
        eop_deficit = max(0.0, min_expected_eop - eop)
        oil_pressure_nominal = eop >= (min_expected_eop - 0.4)
        
        # 3. Air-cooled CHT Bank Balance
        # Left Bank vs Right Bank delta
        cht_delta = abs(cht1 - cht2)
        cht_balance_nominal = cht_delta <= 18.0
        cht_critical_imbalance = cht_delta >= 30.0
        
        # 4. Thermal stress on oil
        oil_temp_warning = eot > 115.0
        oil_temp_critical = eot > 125.0
        
        # 5. Turbocharger boost pressure sanity
        # Above 50% load, boost must be at least 1.25 bar
        boost_nominal = True
        if load_pct > 60.0 and boost < 1.20:
            boost_nominal = False

        violations = []
        if not oil_pressure_nominal:
            violations.append(f"Low Oil Pressure: {eop:.1f} bar below minimum dynamic envelope ({min_expected_eop:.1f} bar)")
        if cht_critical_imbalance:
            violations.append(f"Critical CHT Bank Imbalance: ΔT {cht_delta:.1f}°C exceeds 30°C thermal limit")
        elif not cht_balance_nominal:
            violations.append(f"Elevated CHT Bank Differential: ΔT {cht_delta:.1f}°C")
        if oil_temp_critical:
            violations.append(f"Engine Oil Overheating: {eot:.1f}°C > 125°C threshold")
        if not boost_nominal:
            violations.append(f"Insufficient Turbo Boost ({boost:.2f} bar) at {load_pct:.0f}% load")

        thermo_health_score = 100.0
        if eop_deficit > 0:
            thermo_health_score -= min(45.0, eop_deficit * 30.0)
        if cht_delta > 18.0:
            thermo_health_score -= min(40.0, (cht_delta - 18.0) * 2.0)
        if eot > 105.0:
            thermo_health_score -= min(25.0, (eot - 105.0) * 1.5)
            
        thermo_health_score = max(0.0, min(100.0, thermo_health_score))

        return {
            "power_verified_kw": round(expected_power_kw, 1),
            "min_expected_eop_bar": round(min_expected_eop, 2),
            "eop_deficit_bar": round(eop_deficit, 2),
            "cht_delta_c": round(cht_delta, 1),
            "oil_pressure_nominal": oil_pressure_nominal,
            "cht_balance_nominal": cht_balance_nominal,
            "cht_critical_imbalance": cht_critical_imbalance,
            "oil_temp_nominal": not (oil_temp_warning or oil_temp_critical),
            "thermo_health_score": round(thermo_health_score, 1),
            "violations": violations
        }

    def process_frame(self, raw_frame: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes full multimodal DSP processing on an incoming raw telemetry frame.
        """
        engine_state = raw_frame["engine_state"]
        vib = raw_frame["vibration"]
        rpm = float(engine_state.get("rpm", 1200.0))
        
        rad_x = vib["radial_x"]
        rad_y = vib["radial_y"]
        
        # 1. Time-Domain Metrics
        time_metrics_x = self.compute_time_domain_metrics(rad_x)
        time_metrics_y = self.compute_time_domain_metrics(rad_y)
        
        # 2. Spectral Analysis
        spec_metrics_x, fft_bins_x = self.compute_spectral_features(rad_x, rpm)
        spec_metrics_y, fft_bins_y = self.compute_spectral_features(rad_y, rpm)
        
        # 3. Synchronous Order Tracking (COT)
        sot_x = self.order_tracker.compute_order_spectrum(rad_x, rpm, self.last_rpm)
        sot_y = self.order_tracker.compute_order_spectrum(rad_y, rpm, self.last_rpm)
        self.last_rpm = rpm

        # 4. Thermodynamic Validation
        thermo_validation = self.validate_thermodynamics(engine_state)
        
        # 5. Downsample raw waveform for oscilloscope display
        step = max(1, len(rad_x) // self.n_waveform_points)
        downsampled_waveform = []
        for i in range(0, min(len(rad_x), len(rad_y)), step):
            downsampled_waveform.append({
                "sample_idx": i,
                "x": round(float(rad_x[i]), 3),
                "y": round(float(rad_y[i]), 3)
            })
            if len(downsampled_waveform) >= self.n_waveform_points:
                break

        return {
            "timestamp": raw_frame["timestamp"],
            "engine_state": engine_state,
            "dsp_features": {
                "radial_x": {
                    "time": time_metrics_x,
                    "spectral": spec_metrics_x,
                    "order_peaks": sot_x["order_peaks"]
                },
                "radial_y": {
                    "time": time_metrics_y,
                    "spectral": spec_metrics_y,
                    "order_peaks": sot_y["order_peaks"]
                },
                "cross_axis": {
                    "rms_ratio_xy": round(float(time_metrics_x["rms"] / (time_metrics_y["rms"] + 1e-5)), 2),
                    "max_kurtosis": max(time_metrics_x["kurtosis"], time_metrics_y["kurtosis"])
                },
                "order_tracking": {
                    "total_revolutions": sot_x["total_revolutions"],
                    "radial_x_peaks": sot_x["order_peaks"],
                    "radial_y_peaks": sot_y["order_peaks"],
                    "order_bins": sot_x["order_bins"]
                }
            },
            "thermo_validation": thermo_validation,
            "stream_payload": {
                "waveform": downsampled_waveform,
                "fft_x": fft_bins_x,
                "fft_y": fft_bins_y,
                "order_bins": sot_x["order_bins"]
            }
        }
