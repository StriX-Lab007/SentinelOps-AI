"""GitHub issue side-effect node."""
from __future__ import annotations

from typing import Any, Dict
from datetime import datetime, timezone

from backend.tools.github_tools import create_github_issue
from .state import AgentState
from .timeline import append_timeline


def _span(name: str, parent: str, output: str = "") -> Dict[str, Any]:
    return {
        "name": name,
        "parent": parent,
        "status": "completed",
        "output": output,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def github_issue_agent(state: AgentState) -> AgentState:
    incident_id = state.get("incident_id", "")
    payload = state.get("alert_payload") or {}
    service = payload.get("service", "unknown")
    root = state.get("probable_root_cause", "Undetermined")
    action = state.get("remediation_action", "Manual review")
    confidence = state.get("confidence_score", 0.0)

    title = f"[SentinelOps] {service} — {root[:80]}"
    body = (
        f"## Incident `{incident_id}`\n\n"
        f"**Service:** {service}\n"
        f"**Root cause:** {root}\n"
        f"**Confidence:** {confidence:.0%}\n"
        f"**Recommended action:** {action}\n\n"
        f"### Causal chain\n{state.get('causal_chain', 'N/A')}\n"
    )

    result = create_github_issue(title=title, body=body)
    url = result.get("html_url", "")
    msg = f"GitHub issue created: {url}" if result.get("ok") else "GitHub issue failed"

    return {
        "github_issue_payload": {"title": title, "body": body, "result": result},
        "trace_spans": [_span("github_issue", "remediation_agent", output=msg)],
        "activity": [f"[GitHub] {msg}"],
        "incident_timeline": append_timeline(
            state.get("incident_timeline"),
            f"GitHub issue created for rollback tracking",
            "success",
        ),
    }
