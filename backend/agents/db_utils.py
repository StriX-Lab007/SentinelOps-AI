"""
agents/db_utils.py
-------------------------------------------------------------------------------
Database utility helpers for agent nodes.

Key invariant (DB Resilience):
  Once an incident is marked 'failed' it MUST remain in that state.
  No subsequent status update from a stale or late-arriving agent may
  overwrite 'failed'.  This is enforced in ``update_incident_status``.
-------------------------------------------------------------------------------
"""
from __future__ import annotations

from backend.database import SessionLocal
from backend import models


def update_incident_status(incident_id: str, status: str) -> None:
    """
    Transition the incident to *status* in the database.

    Safety guarantee
    ----------------
    If the incident is already in state ``'failed'``, this function is a
    no-op — the failed state is terminal and must not be overwritten by any
    subsequent (potentially stale) agent call.
    """
    if not incident_id:
        return
    db = SessionLocal()
    try:
        incident = (
            db.query(models.Incident)
            .filter(models.Incident.id == incident_id)
            .first()
        )
        if incident and incident.status != "failed":
            incident.status = status
            db.commit()
    except Exception as exc:
        print(f"[db_utils] Failed to update incident {incident_id} → {status}: {exc}")
    finally:
        db.close()
