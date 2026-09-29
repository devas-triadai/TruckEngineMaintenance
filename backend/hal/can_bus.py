"""
Hardware Abstraction Layer (HAL) - SAE J1939 CAN Bus Interface
Communicates with Tatra ECU over physical CAN networks (SocketCAN vcan0/can0, PEAK PCAN, Kvaser)
and decodes high-priority powertrain Parameter Group Numbers (PGNs).
"""

import asyncio
import logging
import time
from typing import Dict, Any, Optional

from .base import BaseDAQReader

logger = logging.getLogger("HAL.CAN")

try:
    import can
    HAS_PYTHON_CAN = True
except (ImportError, Exception) as e:
    HAS_PYTHON_CAN = False
    logger.warning(f"python-can not installed or CAN bus stack unavailable ({e}). CAN Emulation enabled.")


# Standard SAE J1939 PGN Definitions
PGN_EEC1 = 0xF004    # 61444 - Electronic Engine Controller 1 (RPM, Torque/Load)
PGN_EFL_P1 = 0xFEEF  # 65263 - Engine Fluid Level/Pressure 1 (Oil Pressure)
PGN_ET1 = 0xFEEE     # 65262 - Engine Temperature 1 (Oil Temp, Coolant/Head Temp)
PGN_IC1 = 0xFEF6     # 65270 - Inlet/Exhaust Conditions 1 (Boost Pressure)


class J1939CANReader(BaseDAQReader):
    """
    SAE J1939 CAN transceiver and packet parser.
    Decodes:
      - SPN 190: Engine Speed (0.125 RPM/bit, 0 to 8031.875 RPM)
      - SPN 92: Engine Percent Load At Current Speed (1 %/bit)
      - SPN 100: Engine Oil Pressure (4 kPa/bit, 0 to 1000 kPa)
      - SPN 175: Engine Oil Temperature (1 °C/bit, -40 to 210 °C)
      - SPN 102: Engine Intake Manifold 1 Pressure / Boost (2 kPa/bit)
    """

    def __init__(
        self,
        interface: str = "socketcan",
        channel: str = "can0",
        bitrate: int = 250000,
        sim_fallback = None
    ):
        super().__init__(device_id=f"{interface}:{channel}")
        self.interface = interface
        self.channel = channel
        self.bitrate = bitrate
        self.sim_fallback = sim_fallback
        self.bus: Optional[Any] = None
        self.is_hardware_active = False

        # Latest decoded ECU telemetry cache
        self.cached_ecu = {
            "rpm": 1250.0,
            "torque_nm": 650.0,
            "load_pct": 45.0,
            "oil_pressure_bar": 3.8,
            "oil_temp_c": 92.0,
            "boost_pressure_bar": 1.45,
            "cht1_c": 142.0,
            "cht2_c": 144.0,
            "cht_delta_c": 2.0,
            "cooling_valve_pct": 48.0,
            "can_frames_received": 0,
            "last_can_timestamp": 0.0
        }

    async def connect(self) -> bool:
        """Initializes CAN bus connection."""
        if not HAS_PYTHON_CAN:
            logger.info(f"python-can not present. Operating CAN ({self.device_id}) in EMULATION mode.")
            self.is_connected = True
            self.is_hardware_active = False
            return False

        try:
            # Connect to CAN hardware
            self.bus = can.Bus(
                interface=self.interface,
                channel=self.channel,
                bitrate=self.bitrate,
                receive_own_messages=False
            )
            self.is_connected = True
            self.is_hardware_active = True
            logger.info(f"Connected to physical J1939 CAN bus: {self.device_id} @ {self.bitrate} bps")
            return True
        except Exception as e:
            logger.warning(f"Could not open CAN channel '{self.device_id}' ({e}). Using simulated J1939 frames.")
            self.is_connected = True
            self.is_hardware_active = False
            return False

    def _decode_j1939_message(self, msg: Any):
        """Extracts PGN from 29-bit CAN ID and decodes standard SPNs."""
        can_id = msg.arbitration_id
        # In J1939: PGN is bits 8 to 25
        pgn = (can_id >> 8) & 0x3FFFF

        data = msg.data
        if len(data) < 8:
            return

        now = time.time()
        self.cached_ecu["can_frames_received"] += 1
        self.cached_ecu["last_can_timestamp"] = now

        # PGN 61444 (EEC1)
        if pgn == PGN_EEC1 or (can_id & 0x00FFFF00) == (PGN_EEC1 << 8):
            # Byte 2: SPN 92 Engine Percent Load (1 %/bit, offset 0)
            load = float(data[2])
            self.cached_ecu["load_pct"] = max(0.0, min(100.0, load))

            # Bytes 3-4: SPN 190 Engine Speed (0.125 RPM/bit, 16-bit little-endian)
            raw_rpm = (data[4] << 8) | data[3]
            rpm = raw_rpm * 0.125
            self.cached_ecu["rpm"] = round(rpm, 1)

            # Torque calculation
            max_torque = 1450.0
            self.cached_ecu["torque_nm"] = round(max_torque * (self.cached_ecu["load_pct"] / 100.0), 1)

        # PGN 65263 (EFL_P1) - Engine Fluid Level / Pressure
        elif pgn == PGN_EFL_P1 or (can_id & 0x00FFFF00) == (PGN_EFL_P1 << 8):
            # Byte 3: SPN 100 Engine Oil Pressure (4 kPa/bit) -> convert to bar (1 bar = 100 kPa)
            eop_kpa = data[3] * 4.0
            eop_bar = eop_kpa / 100.0
            self.cached_ecu["oil_pressure_bar"] = round(eop_bar, 2)

        # PGN 65262 (ET1) - Engine Temperature 1
        elif pgn == PGN_ET1 or (can_id & 0x00FFFF00) == (PGN_ET1 << 8):
            # Byte 2: SPN 175 Engine Oil Temp (1 °C/bit, offset -40 °C)
            eot = float(data[2]) - 40.0
            self.cached_ecu["oil_temp_c"] = round(eot, 1)

        # PGN 65270 (IC1) - Inlet Conditions
        elif pgn == PGN_IC1 or (can_id & 0x00FFFF00) == (PGN_IC1 << 8):
            # Byte 1: SPN 102 Boost Pressure (2 kPa/bit) -> convert to bar
            boost_kpa = data[1] * 2.0
            self.cached_ecu["boost_pressure_bar"] = round(boost_kpa / 100.0, 2)

    async def read_frame(self) -> Dict[str, Any]:
        """
        Polls non-blocking J1939 CAN buffer for new messages.
        If physical CAN is silent or emulated, synchronizes with the engine simulation state.
        """
        if self.is_hardware_active and self.bus:
            try:
                # Drain pending messages
                while True:
                    msg = self.bus.recv(timeout=0.0)
                    if msg is None:
                        break
                    self._decode_j1939_message(msg)

                return {
                    "source": "CAN_HARDWARE",
                    "channel": self.device_id,
                    "ecu_state": self.cached_ecu.copy(),
                    "timestamp": time.time()
                }
            except Exception as e:
                logger.error(f"Error reading from CAN bus: {e}")

        # Fallback to engine simulator state
        if self.sim_fallback:
            state = self.sim_fallback.step()["engine_state"]
            self.cached_ecu.update(state)
            return {
                "source": "CAN_EMULATED",
                "channel": f"{self.device_id} (Synthetic J1939)",
                "ecu_state": self.cached_ecu.copy(),
                "timestamp": time.time()
            }

        return {
            "source": "CAN_CACHED",
            "channel": self.device_id,
            "ecu_state": self.cached_ecu.copy(),
            "timestamp": time.time()
        }

    async def disconnect(self) -> None:
        """Shuts down CAN bus interface."""
        if self.bus:
            try:
                self.bus.shutdown()
            except Exception as e:
                logger.warning(f"Error closing CAN interface: {e}")
            finally:
                self.bus = None
        self.is_connected = False
        self.is_hardware_active = False
        logger.info(f"Disconnected J1939 CAN bus ({self.device_id}).")
