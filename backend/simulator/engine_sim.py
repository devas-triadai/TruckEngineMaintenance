"""
Tatra T3B-928 V8 Engine Simulator
Physics-grounded telemetry generator for the Tatra 8x8 air-cooled diesel V8.

Engine Architecture:
- 90° V8, 12.7L displacement, twin-turbocharged, air-cooled
- Heavy-duty tunnel crankcase with cylindrical roller main bearings
- Separate ribbed cylinder heads (Bank 1: Left cylinders 1-4, Bank 2: Right cylinders 5-8)
- Front hydraulic cooling blower with proportional control valve
- Biaxial vibration monitoring at 25.6 kS/s (Radial-X and Radial-Y)
- SAE J1939 ECU parameters
"""

import time
import math
import numpy as np
from typing import Dict, Any, Tuple, Optional


class TatraEngineSimulator:
    def __init__(self, sample_rate: int = 25600, buffer_duration: float = 0.1):
        """
        :param sample_rate: Vibration sampling rate in Hz (default 25.6 kS/s)
        :param buffer_duration: Duration of vibration snapshot buffer in seconds (default 100 ms)
        """
        self.sample_rate = sample_rate
        self.buffer_size = int(sample_rate * buffer_duration)  # 2560 samples
        
        # Engine operating point state
        self.rpm: float = 1250.0  # Cruise RPM (idle: 700, rated max: 2100)
        self.target_rpm: float = 1250.0
        self.load_pct: float = 45.0  # 0 to 100 %
        self.target_load_pct: float = 45.0
        
        # Thermodynamic baseline state
        self.cht_bank1: float = 142.0  # °C (Left bank, air-cooled, norm: 120-165°C)
        self.cht_bank2: float = 144.0  # °C (Right bank)
        self.oil_temp: float = 92.0    # °C (norm: 85-110°C)
        self.oil_pressure: float = 3.8 # bar (norm: 2.0 at idle to 5.5 bar at rated speed)
        self.boost_pressure: float = 1.45 # bar absolute (ambient 1.0 to 2.3 bar full load)
        self.cooling_valve_pct: float = 48.0 # % (hydraulic blower PWM valve)
        
        # Fault injection states
        # Available types: "none", "bearing_flaw", "cooling_imbalance", "lubrication_degradation"
        self.active_fault: str = "none"
        self.fault_severity: float = 0.0  # 0.0 to 1.0
        
        # Internal simulation clock
        self.sim_time: float = 0.0
        self.last_update_wall_time: float = time.time()
        
        # Seed for reproducible initial noise
        self.rng = np.random.default_rng(seed=42)

    def set_fault(self, fault_type: str, severity: float = 1.0) -> Dict[str, Any]:
        """
        Dynamically injects or clears engine faults.
        """
        valid_faults = ["none", "bearing_flaw", "cooling_imbalance", "lubrication_degradation"]
        if fault_type not in valid_faults:
            raise ValueError(f"Unknown fault type: '{fault_type}'. Valid options: {valid_faults}")
        
        self.active_fault = fault_type
        self.fault_severity = max(0.0, min(1.0, float(severity)))
        return {
            "status": "success",
            "active_fault": self.active_fault,
            "severity": self.fault_severity,
            "timestamp": time.time()
        }

    def set_operating_point(self, rpm: Optional[float] = None, load_pct: Optional[float] = None) -> Dict[str, Any]:
        """
        Updates target RPM and engine load percentage.
        """
        if rpm is not None:
            self.target_rpm = max(650.0, min(2200.0, float(rpm)))
        if load_pct is not None:
            self.target_load_pct = max(0.0, min(100.0, float(load_pct)))
            
        return {
            "status": "success",
            "target_rpm": self.target_rpm,
            "target_load_pct": self.target_load_pct
        }

    def _update_thermodynamics(self, dt: float):
        """
        Simulates engine thermal inertia and ECU parameters according to physical engine dynamics.
        """
        # Smoothly track target operating points (mechanical inertia)
        self.rpm += (self.target_rpm - self.rpm) * min(1.0, dt * 2.5)
        self.load_pct += (self.target_load_pct - self.load_pct) * min(1.0, dt * 2.0)
        
        # Calculate mechanical torque: Tatra T3B-928 peaks at ~1450 N*m at 1200-1400 RPM
        rpm_ratio = self.rpm / 2100.0
        torque_curve_factor = 1.0 - 0.25 * ((self.rpm - 1300.0) / 700.0) ** 2
        max_torque_at_rpm = 1450.0 * max(0.6, torque_curve_factor)
        self.engine_torque = max_torque_at_rpm * (self.load_pct / 100.0)
        
        # Turbo Boost pressure: dependent on load and RPM
        target_boost = 1.0 + 1.35 * (self.load_pct / 100.0) * (0.4 + 0.6 * rpm_ratio)
        self.boost_pressure += (target_boost - self.boost_pressure) * min(1.0, dt * 3.0)
        
        # Normal baseline oil pressure: governed by positive-displacement engine oil pump (proportional to RPM)
        # Pressure increases with RPM and drops slightly as oil warms up
        nominal_eop = 1.6 + 3.8 * (self.rpm / 2100.0) - 0.005 * (self.oil_temp - 90.0)
        
        # Fault: Lubrication Degradation
        if self.active_fault == "lubrication_degradation":
            # Significant drop in oil pressure due to pump bypass failure or extreme viscosity loss
            pressure_loss = 2.4 * self.fault_severity
            target_eop = max(0.8, nominal_eop - pressure_loss)
            # High friction causes rapid oil temperature runaway
            target_eot = 92.0 + (self.load_pct * 0.2) + (35.0 * self.fault_severity)
        else:
            target_eop = nominal_eop
            target_eot = 85.0 + (self.load_pct * 0.2) + (self.rpm / 2100.0) * 12.0
            
        self.oil_pressure += (target_eop - self.oil_pressure) * min(1.0, dt * 1.5)
        self.oil_temp += (target_eot - self.oil_temp) * min(1.0, dt * 0.4)
        
        # Air cooling fan valve control (proportional response to max CHT and oil temp)
        max_current_cht = max(self.cht_bank1, self.cht_bank2)
        thermal_demand = max(0.0, (max_current_cht - 130.0) / 40.0) + max(0.0, (self.oil_temp - 90.0) / 30.0)
        target_valve = max(20.0, min(100.0, thermal_demand * 60.0))
        self.cooling_valve_pct += (target_valve - self.cooling_valve_pct) * min(1.0, dt * 1.0)
        
        # Air-cooled Cylinder Head Temperatures
        # Airflow cools banks based on fan valve; combustion load heats them
        cooling_effectiveness = self.cooling_valve_pct / 100.0
        ambient_temp = 25.0
        heat_input = 110.0 + (self.load_pct * 0.75) + (self.rpm / 2100.0) * 20.0
        
        target_cht1 = ambient_temp + (heat_input / (0.8 + 0.6 * cooling_effectiveness))
        
        if self.active_fault == "cooling_imbalance":
            # Bank 2 cooling shutter stuck / cowl debris blockage -> severe imbalance
            imbalance_delta = 42.0 * self.fault_severity
            target_cht2 = target_cht1 + imbalance_delta
        else:
            # Baseline small natural bank difference (+-2°C due to intake ducting asymmetry)
            target_cht2 = target_cht1 + 1.8
            
        self.cht_bank1 += (target_cht1 - self.cht_bank1) * min(1.0, dt * 0.6)
        self.cht_bank2 += (target_cht2 - self.cht_bank2) * min(1.0, dt * 0.6)

    def generate_vibration_buffer(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Generates 25.6 kS/s synchronous biaxial vibration signals (Radial-X and Radial-Y).
        Physics modeling:
        - 1X Fundamental shaft rotation: f0 = RPM / 60
        - 2X Secondary unbalance / structural asymmetry
        - 4X Cylinder Firing Order frequency: 4 firings per crankshaft revolution
        - 8X Firing harmonic
        - Roller Bearing kinematics (BPFO ~ 3.58 * f0, BPFI ~ 5.42 * f0)
        - Baseline industrial structural broadband noise
        - Fault injections (transient impulse ring-downs for bearing flaws)
        """
        t = np.linspace(self.sim_time, self.sim_time + (self.buffer_size / self.sample_rate), self.buffer_size, endpoint=False)
        f0 = self.rpm / 60.0  # Fundamental shaft rotating frequency in Hz
        
        # Fundamental components
        # Radial-X (horizontal) has higher sensitivity to 1X unbalance
        # Radial-Y (vertical) has higher sensitivity to 4X cylinder combustion pressure thrust
        amp_1x = 0.45 * (self.rpm / 2100.0) ** 1.5
        amp_2x = 0.20 * (self.rpm / 2100.0)
        amp_4x = 0.90 * (self.load_pct / 100.0) * (self.rpm / 2100.0) + 0.25  # Main V8 firing harmonic
        amp_8x = 0.35 * (self.load_pct / 100.0)
        
        # Phase shifts (90° physical angle between Radial-X and Radial-Y sensors)
        rad_x = (
            amp_1x * np.sin(2.0 * np.pi * f0 * t) +
            amp_2x * np.sin(2.0 * np.pi * 2.0 * f0 * t + 0.4) +
            amp_4x * 0.65 * np.sin(2.0 * np.pi * 4.0 * f0 * t + 0.1) +
            amp_8x * 0.4 * np.sin(2.0 * np.pi * 8.0 * f0 * t + 0.8)
        )
        
        rad_y = (
            amp_1x * 0.75 * np.cos(2.0 * np.pi * f0 * t) +
            amp_2x * 0.35 * np.cos(2.0 * np.pi * 2.0 * f0 * t + 0.2) +
            amp_4x * 1.25 * np.sin(2.0 * np.pi * 4.0 * f0 * t + 1.57) +  # Direct piston thrust axis
            amp_8x * 0.55 * np.sin(2.0 * np.pi * 8.0 * f0 * t + 0.3)
        )
        
        # Industrial broadband structural background noise (crankcase resonance around 1800 Hz)
        noise_x = self.rng.normal(0.0, 0.22, self.buffer_size)
        noise_y = self.rng.normal(0.0, 0.25, self.buffer_size)
        
        rad_x += noise_x
        rad_y += noise_y
        
        # FAULT INJECTION: Roller Bearing Flaw
        # Outer race defect on tunnel roller bearing: repetitive shock pulses at BPFO
        # with exponential decay ring-downs at structural natural frequency (~3200 Hz)
        if self.active_fault == "bearing_flaw" and self.fault_severity > 0.05:
            bpfo = 3.58 * f0  # Ball Pass Frequency Outer Race
            period_samples = int(self.sample_rate / bpfo)
            if period_samples > 0:
                impulse_train = np.zeros(self.buffer_size)
                # Staggered defect impacts
                pulse_indices = np.arange(0, self.buffer_size, period_samples)
                # Add jitter
                for idx in pulse_indices:
                    jitter = self.rng.integers(-2, 3) if period_samples > 10 else 0
                    pos = min(self.buffer_size - 1, max(0, idx + jitter))
                    impulse_train[pos] = 1.0 * (1.0 + 0.25 * self.rng.standard_normal())
                
                # Synthetic high-frequency ringdown response (3200 Hz resonance with damping)
                ring_len = min(120, period_samples)
                ring_t = np.arange(ring_len) / self.sample_rate
                f_res = 3200.0  # Bearing structural resonance
                damping = 1800.0
                ringdown = np.exp(-damping * ring_t) * np.sin(2 * np.pi * f_res * ring_t)
                
                # Convolve to generate shock pulse train
                fault_signal = np.convolve(impulse_train, ringdown, mode='same')
                fault_gain = 7.5 * self.fault_severity
                rad_x += fault_signal * fault_gain
                rad_y += fault_signal * (fault_gain * 0.85)  # Distributed into both axes
        
        # FAULT INJECTION: Lubrication Degradation
        # Dry micro-scuffing generates elevated broadband white noise and elevated 1X/2X harmonics
        if self.active_fault == "lubrication_degradation" and self.fault_severity > 0.05:
            scuff_noise = self.rng.normal(0.0, 0.8 * self.fault_severity, self.buffer_size)
            rad_x += scuff_noise + (0.5 * self.fault_severity) * np.sin(2 * np.pi * f0 * t)
            rad_y += scuff_noise + (0.4 * self.fault_severity) * np.cos(2 * np.pi * f0 * t)

        return t, rad_x, rad_y

    def step(self) -> Dict[str, Any]:
        """
        Advances the engine simulation by one frame interval (default ~100 ms)
        and returns synchronized multimodal telemetry.
        """
        now = time.time()
        dt = now - self.last_update_wall_time
        # Clamp dt to avoid massive leaps if paused
        dt = max(0.01, min(0.2, dt))
        self.last_update_wall_time = now
        self.sim_time += dt
        
        self._update_thermodynamics(dt)
        t_arr, rad_x, rad_y = self.generate_vibration_buffer()
        
        # Power calculation: P (kW) = Torque (N*m) * RPM / 9549
        power_kw = (self.engine_torque * self.rpm) / 9549.0
        
        return {
            "timestamp": now,
            "engine_state": {
                "rpm": round(self.rpm, 1),
                "target_rpm": self.target_rpm,
                "torque_nm": round(self.engine_torque, 1),
                "power_kw": round(power_kw, 1),
                "load_pct": round(self.load_pct, 1),
                "oil_pressure_bar": round(self.oil_pressure, 2),
                "oil_temp_c": round(self.oil_temp, 1),
                "cht1_c": round(self.cht_bank1, 1),
                "cht2_c": round(self.cht_bank2, 1),
                "cht_delta_c": round(abs(self.cht_bank1 - self.cht_bank2), 1),
                "boost_pressure_bar": round(self.boost_pressure, 2),
                "cooling_valve_pct": round(self.cooling_valve_pct, 1),
                "active_fault": self.active_fault,
                "fault_severity": self.fault_severity
            },
            "vibration": {
                "sample_rate": self.sample_rate,
                "buffer_size": self.buffer_size,
                "t": t_arr,
                "radial_x": rad_x,
                "radial_y": rad_y
            }
        }
