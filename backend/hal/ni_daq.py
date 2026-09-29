"""
Hardware Abstraction Layer (HAL) - National Instruments IEPE Accelerometer Driver
Acquires high-rate synchronous biaxial vibration signals (AI0: Radial-X, AI1: Radial-Y)
with 4 mA constant current IEPE excitation, AC coupling, and anti-aliasing.
Includes graceful fallback if NI-DAQmx C runtime or hardware is not detected.
"""

import asyncio
import logging
import time
import numpy as np
from typing import Dict, Any, Optional

from .base import BaseDAQReader

logger = logging.getLogger("HAL.NIDAQ")

# Optional import for National Instruments NI-DAQmx driver
try:
    import nidaqmx
    from nidaqmx.constants import (
        AcquisitionType,
        Coupling,
        ExcitationSource,
        TerminalConfiguration
    )
    HAS_NIDAQMX = True
except (ImportError, Exception) as e:
    HAS_NIDAQMX = False
    logger.warning(f"nidaqmx driver library not available or NI-DAQmx runtime missing ({e}). Emulation mode enabled.")


class NIIEPEDaqReader(BaseDAQReader):
    """
    Driver for NI C-Series Sound & Vibration modules (e.g., NI 9234 / NI USB-4431).
    Channels:
      - AI0: Radial-X Piezoelectric Accelerometer (Front Crankcase Bulkhead)
      - AI1: Radial-Y Piezoelectric Accelerometer (Main Bearing Crown Saddle)
    """

    def __init__(
        self,
        device_name: str = "cDAQ1Mod1",
        sample_rate: int = 25600,
        buffer_duration: float = 0.1,
        sim_fallback = None
    ):
        super().__init__(device_id=device_name)
        self.device_name = device_name
        self.sample_rate = sample_rate
        self.buffer_size = int(sample_rate * buffer_duration)
        self.sim_fallback = sim_fallback
        self.task = None
        self.is_hardware_active = False

    async def connect(self) -> bool:
        """
        Attempts to create and configure NI-DAQmx Task with IEPE sensor excitation.
        """
        if not HAS_NIDAQMX:
            logger.info(f"NI-DAQmx driver not installed on host. Running {self.device_name} in EMULATION mode.")
            self.is_connected = True
            self.is_hardware_active = False
            return False

        try:
            # Run blocking NI-DAQ initialization in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._init_hardware_task)
            self.is_connected = True
            self.is_hardware_active = True
            logger.info(
                f"Successfully initialized NI hardware task on {self.device_name} "
                f"(Channels: ai0, ai1 | Rate: {self.sample_rate} Hz | IEPE: 4mA/24V)"
            )
            return True
        except Exception as ex:
            logger.warning(
                f"Failed to connect to physical NI device '{self.device_name}' ({ex}). "
                "Engaging resilient mock testbed stream."
            )
            self.is_connected = True
            self.is_hardware_active = False
            return False

    def _init_hardware_task(self):
        """Synchronous setup for nidaqmx task."""
        self.task = nidaqmx.Task(f"Tatra_Vibration_Task_{int(time.time())}")
        
        # Configure AI0: Radial-X (IEPE Accelerometer, +/- 50g range)
        self.task.ai_channels.add_ai_accel_chan(
            f"{self.device_name}/ai0",
            name_to_assign_to_channel="Radial_X",
            terminal_config=TerminalConfiguration.PSEUDODIFFERENTIAL,
            min_val=-50.0,
            max_val=50.0,
            units=nidaqmx.constants.AccelUnits.G,
            sensitivity=100.0,  # 100 mV/g standard industrial sensitivity
            sensitivity_units=nidaqmx.constants.AccelSensitivityUnits.M_VOLTS_PER_G,
            current_excit_source=ExcitationSource.INTERNAL,
            current_excit_val=0.004  # 4 mA IEPE constant current
        )

        # Configure AI1: Radial-Y
        self.task.ai_channels.add_ai_accel_chan(
            f"{self.device_name}/ai1",
            name_to_assign_to_channel="Radial_Y",
            terminal_config=TerminalConfiguration.PSEUDODIFFERENTIAL,
            min_val=-50.0,
            max_val=50.0,
            units=nidaqmx.constants.AccelUnits.G,
            sensitivity=100.0,
            sensitivity_units=nidaqmx.constants.AccelSensitivityUnits.M_VOLTS_PER_G,
            current_excit_source=ExcitationSource.INTERNAL,
            current_excit_val=0.004
        )

        # Configure continuous / finite sampling clock
        self.task.timing.cfg_samp_clk_timing(
            rate=self.sample_rate,
            sample_mode=AcquisitionType.CONTINUOUS,
            samps_per_chan=self.buffer_size * 2
        )
        self.task.start()

    async def read_frame(self) -> Dict[str, Any]:
        """
        Reads one synchronized vibration buffer from NI hardware or simulation fallback.
        """
        if self.is_hardware_active and self.task:
            try:
                loop = asyncio.get_event_loop()
                data = await loop.run_in_executor(
                    None,
                    lambda: self.task.read(
                        number_of_samples_per_channel=self.buffer_size,
                        timeout=0.5
                    )
                )
                rad_x = np.array(data[0], dtype=np.float32)
                rad_y = np.array(data[1], dtype=np.float32)
                t_arr = np.linspace(0, self.buffer_size / self.sample_rate, self.buffer_size, endpoint=False)
                return {
                    "source": "NI_HARDWARE",
                    "device": self.device_name,
                    "sample_rate": self.sample_rate,
                    "buffer_size": self.buffer_size,
                    "t": t_arr,
                    "radial_x": rad_x,
                    "radial_y": rad_y,
                    "iepe_excitation_ma": 4.0,
                    "timestamp": time.time()
                }
            except Exception as e:
                logger.error(f"Hardware read error from NI DAQ: {e}. Falling back to internal engine stream.")
                self.is_hardware_active = False

        # Fallback to engine simulator if hardware not available
        if self.sim_fallback:
            sim_frame = self.sim_fallback.step()
            vib = sim_frame["vibration"]
            return {
                "source": "NI_EMULATED",
                "device": f"{self.device_name} (Synthetic)",
                "sample_rate": self.sample_rate,
                "buffer_size": self.buffer_size,
                "t": vib["t"],
                "radial_x": vib["radial_x"],
                "radial_y": vib["radial_y"],
                "iepe_excitation_ma": 4.0,
                "timestamp": sim_frame["timestamp"],
                "engine_state": sim_frame["engine_state"]
            }

        # Standalone default sine buffer
        t = np.linspace(0, self.buffer_size / self.sample_rate, self.buffer_size, endpoint=False)
        return {
            "source": "NI_MOCK",
            "device": self.device_name,
            "sample_rate": self.sample_rate,
            "buffer_size": self.buffer_size,
            "t": t,
            "radial_x": 0.5 * np.sin(2 * np.pi * 20.0 * t),
            "radial_y": 0.4 * np.cos(2 * np.pi * 20.0 * t),
            "iepe_excitation_ma": 4.0,
            "timestamp": time.time()
        }

    async def disconnect(self) -> None:
        """Stops task and closes handles."""
        if self.task:
            try:
                self.task.stop()
                self.task.close()
            except Exception as e:
                logger.warning(f"Error closing NI-DAQ task: {e}")
            finally:
                self.task = None
        self.is_connected = False
        self.is_hardware_active = False
        logger.info(f"Disconnected NI IEPE DAQ ({self.device_name}).")
