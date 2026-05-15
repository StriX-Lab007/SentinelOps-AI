"""Slack notification side-effect node."""
from __future__ import annotations

from typing import Any, Dict
from datetime import datetime, timezone

from backend.tools.slack_tools import send_slack_message
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


def slack_notification_agent(state: AgentState) -> AgentState:
    slack_message = state.get("slack_message")
    if not slack_message:
        payload = state.get("alert_payload") or {}
        service = payload.get("service", "unknown")
        severity = payload.get("severity", "medium")
        root = state.get("probable_root_cause", "Undetermined")
        action = state.get("remediation_action", "N/A")
        confidence = state.get("confidence_score", 0.0)
        emoji = ":rotating_light:" if severity in ("high", "critical") else ":warning:"
        slack_message = (
            f"{emoji} *SentinelOps `{state.get('incident_id', '')}`*\n"
            f">*Service*: `{service}` | *Root*: {root}\n"
            f">*Action*: _{action}_ ({confidence:.0%} confidence)"
        )

    result = send_slack_message(slack_message)
    dry = " (dry-run)" if result.get("dry_run") else ""
    msg = f"Slack notification dispatched{dry}"

    return {
        "slack_message": slack_message,
        "report_sent": result.get("ok", False),
        "trace_spans": [_span("slack_notification", "remediation_agent", output=msg)],
        "activity": [f"[Slack] {msg}"],
        "incident_timeline": append_timeline(
            state.get("incident_timeline"),
            "Slack alert dispatched to on-call channel",
            "success",
        ),
    }
