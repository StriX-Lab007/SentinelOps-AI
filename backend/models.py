"""
backend/models.py
-------------------------------------------------------------------------------
SQLAlchemy 2.0 typed ORM models.

Uses ``Mapped`` + ``mapped_column`` so pyrefly/pyright understand that
attribute assignments (e.g. incident.summary = "...") are valid str ops,
not Column descriptor assignments.
-------------------------------------------------------------------------------
"""
from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


from typing import Optional

def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    title: Mapped[Optional[str]] = mapped_column(nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(nullable=True)
    status: Mapped[Optional[str]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    summary: Mapped[Optional[str]] = mapped_column(nullable=True)
    root_cause: Mapped[Optional[str]] = mapped_column(nullable=True)
    causal_chain: Mapped[Optional[str]] = mapped_column(nullable=True)
    confidence_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    remediation_action: Mapped[Optional[str]] = mapped_column(nullable=True)
    agent_outputs_json: Mapped[Optional[str]] = mapped_column(nullable=True)


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    service: Mapped[Optional[str]] = mapped_column(nullable=True)
    version: Mapped[Optional[str]] = mapped_column(nullable=True)
    timestamp: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    commit_hash: Mapped[Optional[str]] = mapped_column(nullable=True)


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    service: Mapped[Optional[str]] = mapped_column(nullable=True)
    level: Mapped[Optional[str]] = mapped_column(nullable=True)
    message: Mapped[Optional[str]] = mapped_column(nullable=True)
    timestamp: Mapped[Optional[datetime]] = mapped_column(nullable=True)


class RemediationHistory(Base):
    __tablename__ = "remediation_history"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    incident_id: Mapped[Optional[str]] = mapped_column(nullable=True)
    action: Mapped[Optional[str]] = mapped_column(nullable=True)
    outcome: Mapped[Optional[str]] = mapped_column(nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(nullable=True)


class ExecutionSnapshot(Base):
    __tablename__ = "execution_snapshots"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    incident_id: Mapped[str] = mapped_column(nullable=False)
    agent_name: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False)
    inputs_json: Mapped[Optional[str]] = mapped_column(nullable=True)
    outputs_json: Mapped[Optional[str]] = mapped_column(nullable=True)
    error: Mapped[Optional[str]] = mapped_column(nullable=True)
    timestamp: Mapped[datetime] = mapped_column(default=_now)
