"""
Hardware Abstraction Layer (HAL) - Base DAQ Reader
Abstract interface for acquisition hardware (NI-DAQ IEPE, CAN Bus, and Simulators).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BaseDAQReader(ABC):
    """
    Abstract Base Class for Data Acquisition (DAQ) interfaces.
    Standardizes lifecycle management and asynchronous frame retrieval.
    """

    def __init__(self, device_id: str = "DEFAULT"):
        self.device_id = device_id
        self.is_connected: bool = False

    @abstractmethod
    async def connect(self) -> bool:
        """
        Initializes driver sessions, opens hardware handles, and configures channel properties.
        Returns True if hardware connection succeeded, False if falling back to emulation.
        """
        pass

    @abstractmethod
    async def read_frame(self) -> Dict[str, Any]:
        """
        Acquires a synchronous buffer of high-speed vibration and/or low-speed ECU telemetry.
        """
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """
        Safely stops acquisition tasks and releases hardware handles.
        """
        pass
