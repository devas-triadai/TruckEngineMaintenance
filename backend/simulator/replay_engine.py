"""
Telemetry Replay Engine for Tatra T3B-928 V8 Testbed
Provides time-series replay from uploaded testbed CSV files or historical database runs.
Supports play/pause, scrub, seek, and variable playback speeds (0.5x, 1x, 2x).
"""

import io
import csv
import time
import math
import logging
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("TatraReplay")


class TelemetryReplayEngine:
    def __init__(self):
        self.is_active: bool = False
        self.is_paused: bool = False
        self.source_type: str = "NONE"  # "CSV", "DATABASE", "NONE"
        self.source_name: str = ""
        self.run_id: Optional[str] = None
        
        self.frames: List[Dict[str, Any]] = []
        self.total_frames: int = 0
        self.current_index: int = 0
        self.playback_speed: float = 1.0  # 0.5x, 1.0x, 2.0x
        
        self.last_step_time: float = time.time()
        self.rng = np.random.default_rng(seed=1928)

    def load_csv(self, csv_content: str, filename: str = "uploaded_testbed.csv") -> Dict[str, Any]:
        """
        Parses testbed CSV logs into normalized replay frame structures.
        Supports standard industrial CSV export headers.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        parsed_frames = []

        # Header normalization map
        field_map = {}
        for h in reader.fieldnames or []:
            hl = h.strip().lower().replace(" ", "_").replace("-", "_")
            if "rpm" in hl or "speed" in hl:
                field_map["rpm"] = h
            elif "eop" in hl or "oil_press" in hl:
                field_map["eop"] = h
            elif "eot" in hl or "oil_temp" in hl:
                field_map["eot"] = h
            elif "cht1" in hl or "cht_1" in hl or "bank1" in hl:
                field_map["cht1"] = h
            elif "cht2" in hl or "cht_2" in hl or "bank2" in hl:
                field_map["cht2"] = h
            elif "boost" in hl:
                field_map["boost"] = h
            elif "torque" in hl:
                field_map["torque"] = h
            elif "load" in hl:
                field_map["load"] = h
            elif "vib_x" in hl or "rad_x" in hl or "accel_x" in hl:
                field_map["vib_x"] = h
            elif "vib_y" in hl or "rad_y" in hl or "accel_y" in hl:
                field_map["vib_y"] = h
            elif "fault" in hl:
                field_map["fault"] = h

        sim_t = 0.0
        for row in reader:
            sim_t += 0.1
            rpm = float(row.get(field_map.get("rpm", ""), 1200.0) or 1200.0)
            load = float(row.get(field_map.get("load", ""), 50.0) or 50.0)
            torque = float(row.get(field_map.get("torque", ""), (load / 100.0) * 1400.0) or 700.0)
            eop = float(row.get(field_map.get("eop", ""), 3.5) or 3.5)
            eot = float(row.get(field_map.get("eot", ""), 92.0) or 92.0)
            cht1 = float(row.get(field_map.get("cht1", ""), 138.0) or 138.0)
            cht2 = float(row.get(field_map.get("cht2", ""), 140.0) or 140.0)
            boost = float(row.get(field_map.get("boost", ""), 1.35) or 1.35)
            fault = str(row.get(field_map.get("fault", ""), "none") or "none").strip().lower()

            parsed_frames.append({
                "t_rel": round(sim_t, 2),
                "rpm": rpm,
                "torque_nm": torque,
                "power_kw": round((torque * rpm) / 9549.0, 1),
                "load_pct": load,
                "oil_pressure_bar": eop,
                "oil_temp_c": eot,
                "cht1_c": cht1,
                "cht2_c": cht2,
                "cht_delta_c": round(abs(cht1 - cht2), 1),
                "boost_pressure_bar": boost,
                "cooling_valve_pct": round(min(100.0, max(20.0, (max(cht1, cht2) - 120.0) * 1.5)), 1),
                "active_fault": fault if fault in ["bearing_flaw", "cooling_imbalance", "lubrication_degradation"] else "none",
                "fault_severity": 1.0 if fault != "none" else 0.0
            })

        if not parsed_frames:
            raise ValueError("CSV contains no valid telemetry records")

        self.frames = parsed_frames
        self.total_frames = len(parsed_frames)
        self.current_index = 0
        self.is_active = True
        self.is_paused = False
        self.source_type = "CSV"
        self.source_name = filename
        self.run_id = None
        self.last_step_time = time.time()

        logger.info(f"Loaded {self.total_frames} frames from CSV: {filename}")
        return self.get_status()

    def load_from_records(self, run_id: str, records: List[Dict[str, Any]], run_name: str = "") -> Dict[str, Any]:
        """
        Loads historical test run records from database.
        """
        parsed_frames = []
        for r in records:
            parsed_frames.append({
                "t_rel": r.get("timestamp", 0.0),
                "rpm": r.get("rpm", 1200.0),
                "torque_nm": r.get("torque", 700.0),
                "power_kw": r.get("power_kw", 88.0),
                "load_pct": r.get("load_pct", 50.0),
                "oil_pressure_bar": r.get("eop", 3.8),
                "oil_temp_c": r.get("eot", 92.0),
                "cht1_c": r.get("cht1", 140.0),
                "cht2_c": r.get("cht2", 142.0),
                "cht_delta_c": r.get("cht_delta", 2.0),
                "boost_pressure_bar": r.get("boost", 1.4),
                "cooling_valve_pct": 50.0,
                "active_fault": r.get("active_fault", "none"),
                "fault_severity": 1.0 if r.get("active_fault", "none") != "none" else 0.0
            })

        if not parsed_frames:
            raise ValueError(f"No telemetry records found for run {run_id}")

        self.frames = parsed_frames
        self.total_frames = len(parsed_frames)
        self.current_index = 0
        self.is_active = True
        self.is_paused = False
        self.source_type = "DATABASE"
        self.source_name = run_name or f"Run {run_id[:8]}"
        self.run_id = run_id
        self.last_step_time = time.time()

        logger.info(f"Loaded {self.total_frames} frames from database for run {run_id}")
        return self.get_status()

    def step(self) -> Optional[Dict[str, Any]]:
        """
        Advances the replay and returns the current engine state frame along with synthesized vibration buffer.
        """
        if not self.is_active or not self.frames:
            return None

        frame = self.frames[self.current_index]

        # Advance index if not paused
        if not self.is_paused:
            self.current_index += 1
            if self.current_index >= self.total_frames:
                self.current_index = 0  # Loop replay

        # Generate realistic 25.6 kS/s vibration buffer for this frame state
        sample_rate = 25600
        n_samples = 2560
        f0 = max(1.0, frame["rpm"] / 60.0)
        t = np.linspace(0, 0.1, n_samples, endpoint=False)

        amp_1x = 0.45 * (frame["rpm"] / 2100.0) ** 1.5
        amp_2x = 0.20 * (frame["rpm"] / 2100.0)
        amp_4x = 0.90 * (frame["load_pct"] / 100.0) * (frame["rpm"] / 2100.0) + 0.25
        amp_8x = 0.35 * (frame["load_pct"] / 100.0)

        rad_x = (
            amp_1x * np.sin(2.0 * np.pi * f0 * t) +
            amp_2x * np.sin(2.0 * np.pi * 2.0 * f0 * t + 0.4) +
            amp_4x * 0.65 * np.sin(2.0 * np.pi * 4.0 * f0 * t + 0.1) +
            amp_8x * 0.4 * np.sin(2.0 * np.pi * 8.0 * f0 * t + 0.8) +
            self.rng.normal(0.0, 0.22, n_samples)
        )

        rad_y = (
            amp_1x * 0.75 * np.cos(2.0 * np.pi * f0 * t) +
            amp_2x * 0.35 * np.cos(2.0 * np.pi * 2.0 * f0 * t + 0.2) +
            amp_4x * 1.25 * np.sin(2.0 * np.pi * 4.0 * f0 * t + 1.57) +
            amp_8x * 0.55 * np.sin(2.0 * np.pi * 8.0 * f0 * t + 0.3) +
            self.rng.normal(0.0, 0.25, n_samples)
        )

        # Fault effects in vibration
        if frame["active_fault"] == "bearing_flaw":
            bpfo = 3.58 * f0
            period = max(10, int(sample_rate / bpfo))
            ring_len = min(100, period)
            ring_t = np.arange(ring_len) / sample_rate
            ringdown = np.exp(-1800 * ring_t) * np.sin(2 * np.pi * 3200 * ring_t)
            for idx in range(0, n_samples, period):
                end_idx = min(n_samples, idx + ring_len)
                actual_len = end_idx - idx
                rad_x[idx:end_idx] += ringdown[:actual_len] * 7.5
                rad_y[idx:end_idx] += ringdown[:actual_len] * 6.5
        elif frame["active_fault"] == "lubrication_degradation":
            rad_x += self.rng.normal(0.0, 0.75, n_samples)
            rad_y += self.rng.normal(0.0, 0.75, n_samples)

        return {
            "timestamp": time.time(),
            "engine_state": frame,
            "vibration": {
                "sample_rate": sample_rate,
                "buffer_size": n_samples,
                "t": t,
                "radial_x": rad_x,
                "radial_y": rad_y
            },
            "replay_metadata": {
                "current_index": self.current_index,
                "total_frames": self.total_frames,
                "progress_pct": round((self.current_index / max(1, self.total_frames)) * 100, 1),
                "is_paused": self.is_paused,
                "playback_speed": self.playback_speed,
                "source_type": self.source_type,
                "source_name": self.source_name
            }
        }

    def seek(self, fraction: float) -> Dict[str, Any]:
        """
        Seeks to relative progress (0.0 to 1.0).
        """
        if self.total_frames > 0:
            target = int(max(0.0, min(1.0, fraction)) * (self.total_frames - 1))
            self.current_index = target
        return self.get_status()

    def set_speed(self, speed: float) -> Dict[str, Any]:
        """
        Sets replay speed multiplier (0.5, 1.0, 2.0).
        """
        self.playback_speed = max(0.25, min(4.0, float(speed)))
        return self.get_status()

    def pause(self) -> Dict[str, Any]:
        self.is_paused = True
        return self.get_status()

    def resume(self) -> Dict[str, Any]:
        self.is_paused = False
        return self.get_status()

    def stop(self) -> Dict[str, Any]:
        self.is_active = False
        self.is_paused = False
        self.source_type = "NONE"
        self.source_name = ""
        self.run_id = None
        self.frames = []
        self.total_frames = 0
        self.current_index = 0
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_active": self.is_active,
            "is_paused": self.is_paused,
            "source_type": self.source_type,
            "source_name": self.source_name,
            "run_id": self.run_id,
            "current_index": self.current_index,
            "total_frames": self.total_frames,
            "progress_pct": round((self.current_index / max(1, self.total_frames)) * 100, 1) if self.total_frames else 0.0,
            "playback_speed": self.playback_speed
        }
