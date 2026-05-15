"""Slack webhook side effect and rich mrkdwn payload formatter."""
from __future__ import annotations

import os
import json
from typing import Any, Dict

import urllib.request

from backend.omium_tracing import trace_tool


# ── Formatter (no network I/O) ────────────────────────────────────────────────

def format_incident_message(
    service: str,
    severity: str,
    incident_id: str,
    root_cause: str,
    causal_chain: str,
    remediation_action: str,
    confidence_score: float,
) -> str:
    """
    Build a rich Slack *mrkdwn* alert string.

    No external calls are made here — the string is ready to pass straight
    to ``send_slack_message`` or to store on the incident record.

    Returns a non-empty string in all cases.
    """
    severity_emoji = {
        "critical": ":red_circle:",
        "high":     ":large_orange_circle:",
        "medium":   ":large_yellow_circle:",
        "low":      ":white_circle:",
    }.get(severity.lower(), ":large_purple_circle:")

    confidence_pct = f"{confidence_score:.0%}"
    chain_display  = causal_chain or "_N/A_"

    return (
        f"{severity_emoji} *SentinelOps Alert — {severity.upper()}*\n"
        f">*Service:* `{service}`\n"
        f">*Incident ID:* `{incident_id}`\n"
        f">*Root Cause:* {root_cause}\n"
        f">*Causal Chain:* {chain_display}\n"
        f">*Recommended Action:* :wrench: {remediation_action}\n"
        f">*Confidence:* {confidence_pct} :bar_chart:"
    )


# ── Sender (side-effect) ──────────────────────────────────────────────────────

@trace_tool("slack.send_message")
def send_slack_message(text: str) -> Dict[str, Any]:
    """POST a plain-text or mrkdwn message to the configured Slack webhook."""
    webhook = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook:
        print(f"[Slack] (dry-run) {text[:200]}")
        return {"ok": True, "dry_run": True}

    payload = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode()
        return {"ok": True, "status": resp.status, "body": body}
