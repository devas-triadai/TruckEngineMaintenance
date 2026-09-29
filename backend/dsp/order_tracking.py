"""
Synchronous Order Tracking (SOT) & Computed Order Tracking (COT)
Resamples non-stationary vibration signals from the time domain t into the angular domain θ(t)
to isolate rotational orders (1X shaft unbalance, 2X second order, 4X V8 cylinder firing order)
independent of RPM speed sweeps and dynamic throttle transients.
"""

import numpy as np
from scipy import interpolate
from typing import Dict, Any, List, Tuple


class SynchronousOrderTracker:
    def __init__(self, sample_rate: int = 25600, samples_per_rev: int = 64, max_orders: float = 16.0):
        """
        :param sample_rate: Vibration sample rate in Hz (25.6 kS/s)
        :param samples_per_rev: Angular domain interpolation resolution (e.g., 64 samples per shaft revolution)
        :param max_orders: Maximum order range to output (16 orders covers up to 16X harmonics)
        """
        self.sample_rate = sample_rate
        self.samples_per_rev = samples_per_rev
        self.max_orders = max_orders

    def compute_order_spectrum(
        self,
        sig: np.ndarray,
        rpm: float,
        rpm_prev: float = None
    ) -> Dict[str, Any]:
        """
        Performs angular-domain resampling and computes the order spectrum.
        Returns:
          - order_peaks: Dict with 1X, 2X, 4X, and BPFO (3.58X) amplitudes
          - order_bins: List of { order: float, amp: float } for spectrum visualization
        """
        n_samples = len(sig)
        if n_samples < 64 or rpm < 300.0:
            return self._empty_order_result()

        dt = 1.0 / self.sample_rate
        t = np.arange(n_samples) * dt
        total_time = t[-1]

        # Shaft rotational frequency
        f0_end = rpm / 60.0
        f0_start = (rpm_prev / 60.0) if (rpm_prev is not None and rpm_prev > 300) else f0_end

        # Linearly interpolate instantaneous frequency across the buffer duration
        f0_t = np.linspace(f0_start, f0_end, n_samples)

        # Integrate instantaneous frequency to get cumulative shaft phase angle in radians:
        # θ(t) = 2π * ∫ f0(t) dt
        theta_rad = 2.0 * np.pi * np.cumsum(f0_t) * dt
        total_revolutions = (theta_rad[-1] - theta_rad[0]) / (2.0 * np.pi)

        if total_revolutions < 1.0:
            # Buffer too short for full revolution, fallback to windowed estimation
            return self._fallback_order_estimation(sig, rpm)

        # Create uniform angular grid: constant Δθ per sample
        n_resampled = int(total_revolutions * self.samples_per_rev)
        if n_resampled < 32:
            return self._fallback_order_estimation(sig, rpm)

        theta_uniform = np.linspace(theta_rad[0], theta_rad[-1], n_resampled, endpoint=False)

        # Interpolate raw time-domain vibration onto the uniform angle domain
        # x(t) -> x(θ)
        interp_fn = interpolate.interp1d(theta_rad, sig, kind='linear', fill_value='extrapolate')
        sig_angle = interp_fn(theta_uniform)

        # Apply Hanning window across angular cycles to minimize spectral leakage
        win = np.hanning(len(sig_angle))
        sig_angle_windowed = sig_angle * win

        # FFT in the angular domain: direct result is Orders (cycles per revolution)
        fft_orders = np.fft.rfft(sig_angle_windowed)
        # Scaling factor accounting for window coherent gain
        order_amps = np.abs(fft_orders) * (2.0 / (np.sum(win) + 1e-6))
        
        # Order resolution: Δorder = 1 / total_revolutions
        order_axis = np.fft.rfftfreq(n_resampled, d=1.0 / self.samples_per_rev)

        # Filter orders up to max_orders
        mask = order_axis <= self.max_orders
        orders_filtered = order_axis[mask]
        amps_filtered = order_amps[mask]

        # Extract targeted harmonic order amplitudes using narrow band peak search
        def get_order_amplitude(target_order: float, tolerance: float = 0.15) -> float:
            idx = np.where(np.abs(orders_filtered - target_order) <= tolerance)[0]
            if len(idx) == 0:
                return 0.0
            return float(np.max(amps_filtered[idx]))

        amp_1x = get_order_amplitude(1.0, 0.15)  # 1X Crankshaft fundamental
        amp_2x = get_order_amplitude(2.0, 0.15)  # 2X Second order harmonic
        amp_4x = get_order_amplitude(4.0, 0.20)  # 4X V8 Firing order harmonic
        amp_bpfo = get_order_amplitude(3.58, 0.18)  # BPFO Tunnel roller bearing defect

        # Downsample order bins for frontend rendering (e.g., 64 discrete bins)
        order_bins = []
        step = max(1, len(orders_filtered) // 64)
        for i in range(0, len(orders_filtered), step):
            order_bins.append({
                "order": round(float(orders_filtered[i]), 2),
                "amp": round(float(amps_filtered[i]), 4)
            })
            if len(order_bins) >= 64:
                break

        return {
            "total_revolutions": round(float(total_revolutions), 2),
            "order_peaks": {
                "amp_1x_g": round(amp_1x, 3),
                "amp_2x_g": round(amp_2x, 3),
                "amp_4x_g": round(amp_4x, 3),
                "amp_bpfo_g": round(amp_bpfo, 3)
            },
            "order_bins": order_bins
        }

    def _fallback_order_estimation(self, sig: np.ndarray, rpm: float) -> Dict[str, Any]:
        """Provides steady-state order estimation when buffer spans less than 1 complete revolution."""
        f0 = max(1.0, rpm / 60.0)
        n = len(sig)
        fft_vals = np.abs(np.fft.rfft(sig * np.hanning(n))) * (2.0 / n)
        freqs = np.fft.rfftfreq(n, d=1.0 / self.sample_rate)

        def peak_near_freq(f_target: float):
            idx = np.where(np.abs(freqs - f_target) <= 0.1 * f0)[0]
            return float(np.max(fft_vals[idx])) if len(idx) > 0 else 0.0

        amp_1x = peak_near_freq(f0)
        amp_2x = peak_near_freq(2.0 * f0)
        amp_4x = peak_near_freq(4.0 * f0)
        amp_bpfo = peak_near_freq(3.58 * f0)

        # Synthesize order bins
        bins = []
        for o in np.linspace(0.25, self.max_orders, 64):
            bins.append({"order": round(float(o), 2), "amp": round(peak_near_freq(o * f0), 4)})

        return {
            "total_revolutions": 1.0,
            "order_peaks": {
                "amp_1x_g": round(amp_1x, 3),
                "amp_2x_g": round(amp_2x, 3),
                "amp_4x_g": round(amp_4x, 3),
                "amp_bpfo_g": round(amp_bpfo, 3)
            },
            "order_bins": bins
        }

    def _empty_order_result(self) -> Dict[str, Any]:
        return {
            "total_revolutions": 0.0,
            "order_peaks": {
                "amp_1x_g": 0.0,
                "amp_2x_g": 0.0,
                "amp_4x_g": 0.0,
                "amp_bpfo_g": 0.0
            },
            "order_bins": []
        }
