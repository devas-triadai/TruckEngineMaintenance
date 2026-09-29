"""
Hardware Abstraction Layer (HAL) Manager
Coordinates DAQ hardware readers (NI-DAQmx IEPE and J1939 CAN) alongside
the physics-grounded engine simulator with dynamic runtime switching.
"""

import asyncio
import logging
from typing import Dict, Any, Literal

from .ni_daq import NIIEPEDaqReader
from .can_bus import J1939CANReader
from ..simulator.engine_sim import TatraEngineSimulator

logger = logging.getLogger("HAL.Manager")


class HALManager:
    """
    Manages telemetry acquisition sources:
    - 'SIMULATOR': Internal physics-grounded Tatra V8 diesel model.
    - 'HARDWARE': Real NI-DAQ IEPE accelerometers + J1939 CAN transceiver (with graceful auto-fallback).
    """

    def __init__(self, simulator: TatraEngineSimulator):
        self.simulator = simulator
        self.source_mode: Literal["SIMULATOR", "HARDWARE"] = "SIMULATOR"

        # Instantiate hardware drivers
        self.ni_daq = NIIEPEDaqReader(device_name="cDAQ1Mod1", sample_rate=25600, sim_fallback=self.simulator)
        self.can_reader = J1939CANReader(interface="socketcan", channel="can0", sim_fallback=self.simulator)
        self.is_initialized = False

    async def initialize(self):
        """Initializes drivers and sets up default connection state."""
        if not self.is_initialized:
            await self.ni_daq.connect()
            await self.can_reader.connect()
            self.is_initialized = True
            logger.info("HAL Manager initialized successfully.")

    async def set_source_mode(self, mode: Literal["SIMULATOR", "HARDWARE"]) -> Dict[str, Any]:
        """
        Dynamically switches the active DAQ telemetry ingestion source.
        """
        if mode not in ["SIMULATOR", "HARDWARE"]:
            raise ValueError(f"Invalid mode '{mode}'. Choose 'SIMULATOR' or 'HARDWARE'.")

        self.source_mode = mode
        logger.info(f"HAL source mode changed to: {self.source_mode}")

        return {
            "status": "success",
            "source_mode": self.source_mode,
            "ni_daq_hardware_active": self.ni_daq.is_hardware_active,
            "can_hardware_active": self.can_reader.is_hardware_active
        }

    def get_source_status(self) -> Dict[str, Any]:
        """Returns the current HAL driver status and connection telemetry."""
        return {
            "source_mode": self.source_mode,
            "ni_daq": {
                "device": self.ni_daq.device_name,
                "is_connected": self.ni_daq.is_connected,
                "is_hardware_active": self.ni_daq.is_hardware_active,
                "sample_rate_hz": self.ni_daq.sample_rate
            },
            "can_bus": {
                "channel": self.can_reader.device_id,
                "is_connected": self.can_reader.is_connected,
                "is_hardware_active": self.can_reader.is_hardware_active,
                "frames_received": self.can_reader.cached_ecu.get("can_frames_received", 0)
            }
        }

    async def acquire_multimodal_frame(self) -> Dict[str, Any]:
        """
        Retrieves one synchronized multimodal frame (vibration buffer + ECU telemetry)
        from either the pure simulator or hardware abstraction layer.
        """
        if self.source_mode == "SIMULATOR":
            raw_frame = self.simulator.step()
            raw_frame["source"] = "SIMULATOR"
            return raw_frame
        else:
            # HARDWARE Acquisition
            vib_frame = await self.ni_daq.read_frame()
            can_frame = await self.can_reader.read_frame()

            # Merge into standard multimodal structure
            engine_state = can_frame.get("ecu_state", self.simulator.step()["engine_state"])
            # Ensure required engine_state fields exist
            engine_state.setdefault("active_fault", self.simulator.active_fault)
            engine_state.setdefault("fault_severity", self.simulator.fault_severity)
            engine_state.setdefault("target_rpm", self.simulator.target_rpm)

            # Calculate mechanical brake power: P = (Torque * RPM) / 9549
            rpm = float(engine_state.get("rpm", 1000.0))
            torque = float(engine_state.get("torque_nm", 500.0))
            power_kw = (torque * rpm) / 9549.0
            engine_state["power_kw"] = round(power_kw, 1)

            return {
                "timestamp": vib_frame.get("timestamp", 0.0),
                "source": "HARDWARE" if (self.ni_daq.is_hardware_active or self.can_reader.is_hardware_active) else "HARDWARE_EMULATED",
                "engine_state": engine_state,
                "vibration": {
                    "sample_rate": vib_frame["sample_rate"],
                    "buffer_size": vib_frame["buffer_size"],
                    "t": vib_frame["t"],
                    "radial_x": vib_frame["radial_x"],
                    "radial_y": vib_frame["radial_y"]
                }
            }

    async def shutdown(self):
        """Clean shutdown of all attached hardware DAQ tasks."""
        await self.ni_daq.disconnect()
        await self.can_reader.disconnect()
        logger.info("HAL Manager shut down.")
