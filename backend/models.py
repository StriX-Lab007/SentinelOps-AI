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
from typing import Optional
import uuid

from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    root_cause: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    causal_chain: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    confidence_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    remediation_action: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    agent_outputs_json: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    service: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    commit_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    service: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class RemediationHistory(Base):
    __tablename__ = "remediation_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    incident_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    action: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    outcome: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
