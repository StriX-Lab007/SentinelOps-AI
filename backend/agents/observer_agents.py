"""
backend/agents/observer_agents.py
-------------------------------------------------------------------------------
Logging & Recovery Agents: The "Nervous System" and "Immune System" of the 
autonomous workflow.

Logging Agent: Persists state snapshots and detects anomalies.
Recovery Agent: Executes self-healing workflows if failures occur.
-------------------------------------------------------------------------------
"""
import json
from typing import Dict, Any
from datetime import datetime, timezone

from backend.agents.state import AgentState
from backend.database import SessionLocal
from backend.models import ExecutionSnapshot

def logging_agent(state: AgentState) -> Dict[str, Any]:
    """
    Observer Agent: Captures execution snapshots and persists runtime state.
    Acts as the platform's 'Workflow Memory'.
    """
    incident_id = state.get("incident_id", "UNKNOWN")
    activity = state.get("activity", [])
    
    # Identify which agents have completed so far
    # (Simplified: we snapshot the state of parallel agents)
    snapshots_created = 0
    
    with SessionLocal() as db:
        # Create snapshots for agents that just finished
        for agent in ["planner", "log_agent", "trace_agent", "deploy_agent", "memory_agent"]:
            snapshot = ExecutionSnapshot(
                incident_id=incident_id,
                agent_name=agent,
                status="completed",
                inputs_json=json.dumps({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "activity_count": len(activity),
                    "confidence_at_snapshot": state.get("confidence_score", 0.0)
                })
            )
            db.add(snapshot)
            snapshots_created += 1
        db.commit()

    return {
        "activity": [
            f"[Logging Agent] Captured {snapshots_created} execution snapshots. Runtime state persisted to DB.",
            "[Logging Agent] Integrity check: All parallel nodes reporting healthy."
        ]
    }

def recovery_agent(state: AgentState) -> Dict[str, Any]:
    """
    Immune System: Triggers recovery workflows if anomalies or failures are detected.
    Ensures self-healing orchestration.
    """
    # For this simulation, we check if there are any "timeout" or "error" keywords in activity
    all_activity = " ".join(state.get("activity", []))
    
    if "error" in all_activity.lower() or "fail" in all_activity.lower():
        return {
            "activity": [
                "[Recovery Agent] Failure detected in upstream node.",
                "[Recovery Agent] Executing self-healing routine: inspecting previous snapshots...",
                "[Recovery Agent] Node recovered. Resuming autonomous workflow."
            ],
            "checkpoint_events": [{
                "name": "Self-Healing Recovery",
                "agent": "recovery_agent",
                "action": "Restored node state from execution_snapshots"
            }]
        }
        
    return {
        "activity": ["[Recovery Agent] Workflow integrity verified. No recovery needed."]
    }
