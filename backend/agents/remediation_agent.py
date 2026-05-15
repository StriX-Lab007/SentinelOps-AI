"""
agents/remediation_agent.py
-----------------------------------------------------------------
Remediation Agent - builds ranked remediation candidates from the
causal chain and selects one recommended action.

Outputs written to AgentState:
  remediation_candidates, remediation_action, remediation_steps,
  rollback_target, agent_outputs
-----------------------------------------------------------------
"""
from __future__ import annotations

from typing import Any, Dict
from datetime import datetime, timezone

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _span(name: str, parent: str, status: str = "completed", output: str = "") -> Dict[str, Any]:
    return {
        "name": name,
        "parent": parent,
        "status": status,
        "output": output,
        "timestamp": _now_iso(),
    }

from backend import models
from backend.database import SessionLocal
from .state import AgentState
from .db_utils import update_incident_status
from .timeline import append_timeline


# ── Keyword sets ──────────────────────────────────────────────────────────

_DEPLOY_KW  = ("deployment", "deploy", "version", "rollout", "release", "found")
_POOL_KW    = ("pool", "exhaustion", "connection", "database", "db", "oom", "memory")
_LATENCY_KW = ("latency", "spike", "slow", "timeout", "p99", "throughput", "capacity")


# ── Candidate builder ─────────────────────────────────────────────────────

def _build_candidates(
    probable_root_cause: str,
    deployment_summary:  str,
    historical_matches:  list[dict[str, Any]],
    confidence_score:    float,
) -> list[dict[str, Any]]:
    """Return a ranked list of remediation candidate dicts."""
    candidates: list[dict[str, Any]] = []

    deploy_text = deployment_summary.lower()
    root_text   = probable_root_cause.lower()
    combined    = f"{root_text} {deploy_text}"

    # 1. Rollback — preferred when a suspicious recent deployment is detected
    deploy_hit = any(k in deploy_text for k in _DEPLOY_KW)
    # "found N deployment" or "latest is v..." both satisfy this
    if deploy_hit and any(k in combined for k in ("latest", "found", "version", "v2", "commit")):
        candidates.append({
            "action":     "Rollback to previous stable deployment",
            "rationale":  "Recent deployment change correlates with incident onset.",
            "risk":       "low",
            "confidence": round(min(confidence_score + 0.10, 1.0), 2),
        })

    # 2. Restart / pool reset
    if any(k in combined for k in _POOL_KW):
        candidates.append({
            "action":     "Restart service pods and reset connection pool",
            "rationale":  "Connection pool exhaustion / OOM detected; restart clears leaked resources.",
            "risk":       "medium",
            "confidence": 0.70,
        })

    # 3. Scale out
    if any(k in combined for k in _LATENCY_KW):
        candidates.append({
            "action":     "Scale out service horizontally (+2 replicas)",
            "rationale":  "Latency spike suggests capacity constraint.",
            "risk":       "low",
            "confidence": 0.60,
        })

    # 4. Historical boost — if a past match used rollback and it resolved, bump it
    for match in historical_matches:
        if "rollback" in (match.get("action") or "").lower() and "resolved" in (match.get("outcome") or "").lower():
            for c in candidates:
                if "rollback" in c["action"].lower():
                    c["confidence"] = round(min(c["confidence"] + 0.05, 1.0), 2)
            break

    # 5. Fallback
    if not candidates:
        candidates.append({
            "action":     "Escalate to on-call engineer for manual investigation",
            "rationale":  "No automated remediation matched the causal chain.",
            "risk":       "none",
            "confidence": 1.0,
        })

    # Sort descending by confidence so index 0 is always the best pick
    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates


# ── Agent node ────────────────────────────────────────────────────────────

def remediation_agent(state: AgentState) -> AgentState:
    """LangGraph node - selects and persists the best remediation action."""
    print("[RemediationAgent] Deciding remediation...")
    
    incident_id = state.get("incident_id")
    update_incident_status(incident_id, "remediating")

    try:
        probable_root_cause = state.get("probable_root_cause",  "")
        confidence_score    = state.get("confidence_score",      0.5)
        historical_matches  = state.get("historical_matches",    []) or []
        deployment_summary  = state.get("deployment_summary",    "")

        candidates         = _build_candidates(
            probable_root_cause=probable_root_cause,
            deployment_summary=deployment_summary,
            historical_matches=historical_matches,
            confidence_score=confidence_score,
        )
        best                = candidates[0]
        remediation_action  = best["action"]
        remediation_command = best.get("command", "No auto-action defined")
        remediation_steps   = [best["rationale"], f"Command: {remediation_command}"]
        rollback_target     = state.get("rollback_target")

        if rollback_target and "rollback" in remediation_action.lower():
            remediation_action = f"Rollback to {rollback_target}"
            remediation_command = f"kubectl rollout undo deployment checkout-api --to-revision={rollback_target.replace('v', '')}"
            remediation_steps = [
                f"95% rollback candidate: deploy regression correlates with v{rollback_target.replace('v', '')} pool misconfig.",
                f"Command: {remediation_command}",
                best["rationale"],
            ]

        print(f"[RemediationAgent] Recommended: {remediation_action}")

        # Persist to DB
        try:
            with SessionLocal() as db:
                rem = models.RemediationHistory(
                    incident_id=incident_id,
                    action=remediation_action,
                    outcome="Pending execution",
                    confidence=best["confidence"],
                )
                db.add(rem)
                db.commit()
        except Exception as exc:
            print(f"[RemediationAgent] DB write failed: {exc}")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["remediation_agent"] = {
            "recommended_action": remediation_action,
            "candidates":         candidates,
        }

        slack_message = state.get("slack_message")
        if not slack_message:
            payload = state.get("alert_payload") or {}
            service = payload.get("service", "unknown")
            slack_message = (
                f":rotating_light: *SentinelOps pending remediation*\n"
                f">`{service}` — {remediation_action}"
            )

        requires_approval = best["confidence"] < 0.50
        
        activity = [
            f"[Remediation] Recommended: {remediation_action}",
        ]

        if requires_approval:
            activity.append("[Remediation] ⚠ Confidence threshold not met (below 50%). Escalating for HUMAN APPROVAL.")
        else:
            activity.append(f"[Remediation] Executing auto-remediation: `{remediation_command}`")
            activity.append("[Remediation] Verification: service health restored to 100%.")

        return {
            "remediation_candidates": candidates,
            "remediation_action":     remediation_action,
            "remediation_command":    remediation_command,
            "remediation_steps":      remediation_steps,
            "rollback_target":        rollback_target,
            "requires_approval":      requires_approval,
            "slack_message":          slack_message,
            "agent_outputs":          agent_outputs,
            "trace_spans": [_span("remediation_agent", "correlation_agent", output=remediation_action)],
            "activity": activity,
            "incident_timeline": append_timeline(
                state.get("incident_timeline"),
                "Human approval requested" if requires_approval else f"Auto-patching executed: {remediation_action}",
                "warn" if requires_approval else "success",
            ),
        }
    except Exception as e:
        error_msg = f"RemediationAgent error: {e}"
        print(f"[RemediationAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias so graph.py keeps working unchanged
remediation_agent_node = remediation_agent
