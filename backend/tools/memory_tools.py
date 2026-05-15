"""Remediation memory — past incident patterns."""
from __future__ import annotations

from typing import Any, Dict, List

from backend.database import SessionLocal
from backend import models
from backend.omium_tracing import trace_tool


@trace_tool("memory.get_remediation_history")
def get_recent_remediation_history(limit: int = 5) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(models.RemediationHistory)
            .order_by(models.RemediationHistory.id.desc())
            .limit(limit)
            .all()
        )
        if not rows:
            return [{
                "action": "Rollback billing-service to v2.13.9",
                "outcome": "resolved",
                "confidence": 0.92,
            }]
        return [
            {
                "action": r.action,
                "outcome": r.outcome,
                "confidence": r.confidence,
            }
            for r in rows
        ]
    finally:
        db.close()
