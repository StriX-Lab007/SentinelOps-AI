"""Deployment history tools with rollback metadata."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from backend.database import SessionLocal
from backend import models
from backend.omium_tracing import trace_tool


def seed_demo_deployments(service: str = "checkout-api") -> None:
    """
    Seed two deployments:
      v2.13.9  — known stable, deployed 2 days ago (rollback target)
      v2.14.0  — suspect regression, deployed 6 minutes before the alert
    """
    db = SessionLocal()
    try:
        if db.query(models.Deployment).filter(models.Deployment.service == service).count() > 0:
            return
        now = datetime.now(timezone.utc)
        db.add_all([
            models.Deployment(
                service=service,
                version="v2.13.9",
                timestamp=now - timedelta(days=2),
                commit_hash="a1b2c3d",
            ),
            models.Deployment(
                service=service,
                version="v2.14.0",
                timestamp=now - timedelta(minutes=6),
                commit_hash="8f92a1c",
            ),
        ])
        db.commit()
    finally:
        db.close()


@trace_tool("deployments.get_recent")
def get_recent_deployments(service: str, limit: int = 10) -> List[Dict[str, Any]]:
    seed_demo_deployments(service)
    db = SessionLocal()
    try:
        rows = (
            db.query(models.Deployment)
            .filter(models.Deployment.service == service)
            .order_by(models.Deployment.timestamp.desc())
            .limit(limit)
            .all()
        )
        result: List[Dict[str, Any]] = []
        for i, r in enumerate(rows):
            prev = rows[i + 1] if i + 1 < len(rows) else None
            result.append({
                "id":               r.id,
                "service":          r.service,
                "version":          r.version,
                "commit_hash":      r.commit_hash,
                "timestamp":        r.timestamp.isoformat() if r.timestamp else None,
                "previous_version": prev.version if prev else None,
                # Annotate the oldest entry as the known-stable rollback baseline
                "stable_baseline":  (i == len(rows) - 1),
            })
        return result
    finally:
        db.close()

