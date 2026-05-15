"""Mock distributed trace spans with dependency bottleneck."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.omium_tracing import trace_tool


_MOCK_SPANS: Dict[str, List[Dict[str, Any]]] = {
    "checkout-api": [
        {"operation": "POST /api/checkout", "duration_ms": 2412, "status": "timeout", "service": "api-gateway"},
        {"operation": "checkout-api.verify", "duration_ms": 2380, "status": "timeout", "service": "checkout-api"},
        {"operation": "db.query.verifyTransaction", "duration_ms": 2350, "status": "error", "service": "checkout-api"},
        {"operation": "redis.get.session", "duration_ms": 3, "status": "ok", "service": "checkout-api"},
    ],
    "billing-service": [
        {"operation": "billing-service.charge", "duration_ms": 2200, "status": "timeout", "service": "billing-service"},
        {"operation": "db.query.pool_acquire", "duration_ms": 2180, "status": "error", "service": "billing-service"},
    ],
}


@trace_tool("traces.fetch_spans")
def fetch_trace_spans(service: str, limit: int = 100) -> List[Dict[str, Any]]:
    spans = _MOCK_SPANS.get(service, _MOCK_SPANS.get("checkout-api", []))
    ts = datetime.now(timezone.utc).isoformat()
    return [{**s, "timestamp": ts} for s in spans[:limit]]


def summarise_traces(spans: List[Dict[str, Any]], service: str) -> str:
    if not spans:
        return f"No trace spans found for {service}."
    slow = [s for s in spans if s.get("duration_ms", 0) > 500]
    errors = [s for s in spans if s.get("status") in ("error", "timeout")]
    if errors:
        worst = max(errors, key=lambda s: s.get("duration_ms", 0))
        return (
            f"Analysed {len(spans)} spans for {service}. "
            f"Bottleneck: {worst.get('operation')} ({worst.get('duration_ms')}ms, {worst.get('status')})."
        )
    return f"Analysed {len(spans)} spans for {service}. No critical anomalies."
