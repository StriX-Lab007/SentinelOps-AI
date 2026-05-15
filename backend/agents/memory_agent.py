"""
agents/memory_agent.py
-----------------------------------------------------------------
Memory Agent - retrieves recent remediation history and surfaces
historical matches relevant to the incident.

Outputs written to AgentState:
  historical_matches, memory_context, agent_outputs, errors
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

import time

from backend.tools.memory_tools import get_recent_remediation_history
from .state import AgentState
from .db_utils import update_incident_status
from .tasks import update_task_status


def memory_agent(state: AgentState) -> AgentState:
    """LangGraph node - retrieves similar past incidents from memory."""
    print("[MemoryAgent] Retrieving remediation history...")
    
    incident_id = state.get("incident_id")
    if incident_id is not None:
        update_incident_status(incident_id, "investigating")
    else:
        incident_id = ""

    try:
        try:
            raw_history = get_recent_remediation_history(limit=5)
        except Exception as exc:
            error_msg = f"MemoryAgent error: {exc}"
            print(f"[MemoryAgent] {error_msg}")
            update_incident_status(incident_id, "failed")
            return {
                "historical_matches": [],
                "memory_context": "",
                "errors": [error_msg],
            }

        matches: list[dict[str, Any]] = []
        for row in raw_history:
            matches.append({
                "action": row.get("action", "unknown"),
                "outcome": row.get("outcome", "unknown"),
                "confidence": row.get("confidence", 0.0),
            })

        # Optional context string for downstream agents like correlation
        if matches:
            context_lines = [f"{m['action']} (outcome: {m['outcome']})" for m in matches]
            memory_context = "Recent history: " + "; ".join(context_lines)
        else:
            memory_context = "No relevant remediation history found."

        time.sleep(0.35)
        print(f"[MemoryAgent] Found {len(matches)} historical matches.")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["memory_agent"] = {
            "matches_found": len(matches),
            "matches": matches,
        }

        tasks = update_task_status(state.get("tasks") or [], "memory_agent", "completed", memory_context[:120])

        return {
            "historical_matches": matches,
            "memory_context": memory_context,
            "agent_outputs": agent_outputs,
            "trace_spans": [_span("memory_agent", "planner_agent", output=memory_context)],
            "activity": [f"[Memory Agent] {len(matches)} similar incidents — rollback pattern found"],
        }
    except Exception as e:
        error_msg = f"MemoryAgent unhandled error: {e}"
        print(f"[MemoryAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias so graph.py keeps working unchanged
memory_agent_node = memory_agent
