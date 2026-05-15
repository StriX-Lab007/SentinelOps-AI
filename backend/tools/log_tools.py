"""Fetch and seed service logs (mock operational dataset)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from backend.database import SessionLocal
from backend import models
from backend.omium_tracing import trace_tool


def seed_demo_logs(service: str = "checkout-api") -> None:
    """
    Insert a causally-linked, staggered log story for demo reliability.

    Timeline (relative to now):
      T-6m  INFO   — Application startup with deploy v2.14.0 (db_pool_size reduced)
      T-3m  WARN   — Pool utilization hits 98% (first early warning signal)
      T-2m  ERROR  — First DB connection exhaustion: HikariCP 30 s timeout
      T-90s ERROR  — Second DB connection exhaustion (repeated / escalating)
      T-60s ERROR  — Downstream checkout transaction timeout cascade
    """
    db = SessionLocal()
    try:
        if db.query(models.Log).filter(models.Log.service == service).count() > 0:
            return
        now = datetime.now(timezone.utc)
        entries = [
            (
                timedelta(minutes=6),
                "INFO",
                "Application started — db_pool_size=10 (was 500) deploy_version=v2.14.0 "
                "[REGRESSION] pool config reduced from previous release",
            ),
            (
                timedelta(minutes=3),
                "WARN",
                "HikariPool-1 — Connection pool utilization: 98% "
                "(9/10 connections active). Approaching exhaustion.",
            ),
            (
                timedelta(minutes=2),
                "ERROR",
                "HikariPool-1 — Connection is not available, "
                "request timed out after 30006ms. Consider pool size increase.",
            ),
            (
                timedelta(seconds=90),
                "ERROR",
                "Cannot get a connection, pool error: Timeout waiting for connection "
                "from pool after 30000ms. 10/10 connections in use.",
            ),
            (
                timedelta(seconds=60),
                "ERROR",
                "checkout.verifyTransaction failed — downstream timeout cascading: "
                "DB pool exhausted, all in-flight requests queued >30s.",
            ),
        ]
        for delta, level, message in entries:
            db.add(models.Log(
                service=service,
                level=level,
                message=message,
                timestamp=now - delta,
            ))
        db.commit()
    finally:
        db.close()


@trace_tool("logs.get_recent")
def get_recent_logs(service: str, limit: int = 50) -> List[Dict[str, Any]]:
    seed_demo_logs(service)
    db = SessionLocal()
    try:
        rows = (
            db.query(models.Log)
            .filter(models.Log.service == service)
            .order_by(models.Log.timestamp.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "service": r.service,
                "level": r.level,
                "message": r.message,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in rows
        ]
    finally:
        db.close()
