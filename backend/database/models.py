"""
SQLAlchemy Database Models for Tatra T3B-928 V8 Testbed
Persists Test Runs, High-Rate Telemetry Records, and AI Diagnostic Events.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    Index,
    Boolean
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    engine_serial = Column(String(64), nullable=False, default="TATRA-T3B-928-80-0419")
    run_name = Column(String(128), nullable=False, default="Operational Endurance Test")
    operator_id = Column(String(64), nullable=False, default="TECH-BEML-01")
    start_time = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    end_time = Column(DateTime, nullable=True)
    
    # Health and operational metrics
    initial_ehi = Column(Float, nullable=False, default=100.0)
    min_ehi = Column(Float, nullable=False, default=100.0)
    final_status = Column(String(32), nullable=False, default="RECORDING")  # "PASSED", "FLAGGED", "CRITICAL", "RECORDING"
    primary_fault = Column(String(64), nullable=False, default="none")
    
    total_records = Column(Integer, nullable=False, default=0)
    max_rpm = Column(Float, nullable=False, default=0.0)
    min_eop = Column(Float, nullable=False, default=5.0)
    max_cht_delta = Column(Float, nullable=False, default=0.0)
    max_kurtosis_x = Column(Float, nullable=False, default=3.0)
    notes = Column(Text, nullable=True, default="")

    # Relationships
    records = relationship("TelemetryRecord", back_populates="run", cascade="all, delete-orphan", order_by="TelemetryRecord.timestamp")
    diagnostic_events = relationship("DiagnosticEvent", back_populates="run", cascade="all, delete-orphan", order_by="DiagnosticEvent.timestamp")

    def to_dict(self):
        return {
            "id": self.id,
            "engine_serial": self.engine_serial,
            "run_name": self.run_name,
            "operator_id": self.operator_id,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": round((self.end_time - self.start_time).total_seconds(), 1) if (self.end_time and self.start_time) else None,
            "initial_ehi": round(self.initial_ehi, 1),
            "min_ehi": round(self.min_ehi, 1),
            "final_status": self.final_status,
            "primary_fault": self.primary_fault,
            "total_records": self.total_records,
            "max_rpm": round(self.max_rpm, 1),
            "min_eop": round(self.min_eop, 2),
            "max_cht_delta": round(self.max_cht_delta, 1),
            "max_kurtosis_x": round(self.max_kurtosis_x, 2),
            "notes": self.notes or "",
            "diagnostic_events_count": len(self.diagnostic_events) if self.diagnostic_events else 0
        }


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(Float, nullable=False, index=True)

    # ECU Parameters (SAE J1939)
    rpm = Column(Float, nullable=False)
    torque = Column(Float, nullable=False)
    power_kw = Column(Float, nullable=False)
    load_pct = Column(Float, nullable=False)
    eop = Column(Float, nullable=False)          # Engine Oil Pressure (bar)
    eot = Column(Float, nullable=False)          # Engine Oil Temperature (°C)
    cht1 = Column(Float, nullable=False)         # Left Bank CHT (°C)
    cht2 = Column(Float, nullable=False)         # Right Bank CHT (°C)
    cht_delta = Column(Float, nullable=False)    # |CHT1 - CHT2|
    boost = Column(Float, nullable=False)        # Boost Pressure (bar)

    # Vibration DSP & Order Tracking
    vibration_rms_x = Column(Float, nullable=False)
    vibration_rms_y = Column(Float, nullable=False)
    kurtosis_x = Column(Float, nullable=False)
    kurtosis_y = Column(Float, nullable=False)
    order_1x = Column(Float, nullable=False)
    order_2x = Column(Float, nullable=False)
    order_4x = Column(Float, nullable=False)
    bpfo_order = Column(Float, nullable=False, default=0.0)

    # Health & Anomaly
    ehi = Column(Float, nullable=False)
    anomaly_score = Column(Float, nullable=False)
    active_fault = Column(String(64), nullable=False, default="none")

    # Relationship
    run = relationship("TestRun", back_populates="records")

    __table_args__ = (
        Index("idx_run_timestamp", "run_id", "timestamp"),
    )

    def to_dict(self):
        return {
            "timestamp": self.timestamp,
            "rpm": self.rpm,
            "torque": self.torque,
            "power_kw": self.power_kw,
            "load_pct": self.load_pct,
            "eop": self.eop,
            "eot": self.eot,
            "cht1": self.cht1,
            "cht2": self.cht2,
            "cht_delta": self.cht_delta,
            "boost": self.boost,
            "vibration_rms_x": self.vibration_rms_x,
            "vibration_rms_y": self.vibration_rms_y,
            "kurtosis_x": self.kurtosis_x,
            "kurtosis_y": self.kurtosis_y,
            "order_1x": self.order_1x,
            "order_2x": self.order_2x,
            "order_4x": self.order_4x,
            "bpfo_order": self.bpfo_order,
            "ehi": self.ehi,
            "anomaly_score": self.anomaly_score,
            "active_fault": self.active_fault
        }


class DiagnosticEvent(Base):
    __tablename__ = "diagnostic_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(Float, nullable=False)
    trigger_type = Column(String(64), nullable=False)  # "MANUAL", "EHI_LOW", "ISO_ZONE_D", "BEARING_IMPULSE", "THERMAL_IMBALANCE"
    ehi_at_trigger = Column(Float, nullable=False)
    criticality = Column(String(32), nullable=False)   # "LOW", "MEDIUM", "HIGH", "IMMEDIATE_SHUTDOWN"
    component_affected = Column(String(128), nullable=False)
    root_cause_hypothesis = Column(Text, nullable=False)
    recommended_actions = Column(Text, nullable=False)

    run = relationship("TestRun", back_populates="diagnostic_events")

    def to_dict(self):
        return {
            "id": self.id,
            "run_id": self.run_id,
            "timestamp": self.timestamp,
            "trigger_type": self.trigger_type,
            "ehi_at_trigger": round(self.ehi_at_trigger, 1),
            "criticality": self.criticality,
            "component_affected": self.component_affected,
            "root_cause_hypothesis": self.root_cause_hypothesis,
            "recommended_actions": self.recommended_actions
        }
