"""Incident timeline events — single source for UI causal reconstruction."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List


def _now_label() -> str:
    return datetime.now(timezone.utc).strftime("%I:%M %p").lstrip("0")


def timeline_event(event: str, kind: str = "info") -> Dict[str, Any]:
    return {"time": _now_label(), "event": event, "type": kind}


def append_timeline(
    existing: List[Dict[str, Any]] | None,
    event: str,
    kind: str = "info",
) -> List[Dict[str, Any]]:
    base = list(existing or [])
    base.append(timeline_event(event, kind))
    return base
