"""
agents/deploy_agent.py
-----------------------------------------------------------------
Deploy Agent - fetches recent deployments and identifies
potential regression candidates.

Outputs written to AgentState:
  recent_deployments, deployment_summary, agent_outputs, errors
-----------------------------------------------------------------
"""
from __future__ import annotations

import time

from backend.tools.deployment_tools import get_recent_deployments
from typing import Any, Dict
from datetime import datetime, timezone
from .specialist_llm import analyze_deployments
from .tasks import update_task_status
from .timeline import append_timeline

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
from .state import AgentState
from .db_utils import update_incident_status


def deploy_agent(state: AgentState) -> AgentState:
    """LangGraph node - fetches and summarises recent deployments."""
    print("[DeployAgent] Checking deployments...")
    
    incident_id = state.get("incident_id")
    if incident_id is not None:
        update_incident_status(incident_id, "investigating")
    else:
        incident_id = ""

    try:
        payload = state.get("alert_payload") or {}
        service = payload.get("service", "unknown")
        
        simulate = "dependency_failure" in state.get("simulate_failures", "")
        retries = state.get("deploy_agent_retries", 0)
        
        if simulate and retries == 0:
            print("[DeployAgent] Simulating dependency failure for recovery testing...")
            # We skip real K8s check and use seeded demo data
        else:
            # Real logic would go here
            pass

        try:
            deployments = get_recent_deployments(service, limit=10)
        except Exception as exc:
            error_msg = f"DeployAgent error: {exc}"
            print(f"[DeployAgent] {error_msg}")
            update_incident_status(incident_id, "failed")
            return {
                "recent_deployments": [],
                "deployment_summary": "Deployment fetch failed.",
                "errors": [error_msg],
            }

        recent_count = len(deployments)
        rollback_candidate = None
        
        if not deployments:
            summary = f"No recent deployments found for {service}."
        else:
            latest = deployments[0]
            version = latest.get("version", "unknown")
            commit = latest.get("commit_hash", "unknown")
            
            # Check if there is a previous version to rollback to
            if latest.get("previous_version"):
                rollback_candidate = latest["previous_version"]
                
            summary = f"Found {recent_count} recent deployment(s) for {service}. Latest is {version} (commit {commit})."
            if rollback_candidate:
                summary += f" Previous stable version: {rollback_candidate}."

        llm_summary = analyze_deployments(service, deployments, summary)
        if llm_summary:
            summary = llm_summary

        time.sleep(0.7)
        print(f"[DeployAgent] {summary}")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["deploy_agent"] = {
            "service": service,
            "recent_count": recent_count,
            "rollback_candidate": rollback_candidate,
            "summary": summary,
            "engine": "llm" if llm_summary else "rules",
        }

        version = deployments[0].get("version", "unknown") if deployments else "unknown"
        tasks = update_task_status(state.get("tasks") or [], "deploy_agent", "completed", summary[:120])

        return {
            "recent_deployments": deployments,
            "deployment_summary": summary,
            "rollback_target": rollback_candidate,
            "agent_outputs": agent_outputs,
            "trace_spans": [_span("deploy_agent", "planner_agent", output=summary)],
            "activity": [f"[Deploy Agent] Regression candidate {version} identified"],
            "incident_timeline": append_timeline(
                state.get("incident_timeline"),
                f"Deployment Agent found rollout {version}",
                "deploy",
            ),
        }
    except Exception as e:
        error_msg = f"DeployAgent unhandled error: {e}"
        print(f"[DeployAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias for compatibility with existing graph.py
deploy_agent_node = deploy_agent
