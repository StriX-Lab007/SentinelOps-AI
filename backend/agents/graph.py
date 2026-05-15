from typing import List
from langgraph.graph import END, StateGraph

from .state import AgentState

from .planner_agent import planner_agent
from .log_agent import log_agent
from .deploy_agent import deploy_agent
from .trace_agent import trace_agent
from .correlation_agent import correlation_agent
from .memory_agent import memory_agent
from .remediation_agent import remediation_agent
from .reporter_agent import reporter_agent
from .github_agent import github_issue_agent
from .slack_agent import slack_notification_agent
from .observer_agents import logging_agent, recovery_agent

import json
import time
from backend import models
from backend.database import SessionLocal
from backend.core.events import Event, EventType, EventSeverity
from backend.core.events.event_bus import sync_publish

def snapshot_wrapper(name: str):
    """
    Automatic Execution Snapshot Wrapper.
    Persists inputs, outputs, and status to the DB for EVERY agent execution.
    Forms the platform's 'Runtime Memory Layer'.
    """
    def decorator(fn):
        def wrapped(state: AgentState):
            incident_id = state.get("incident_id", "UNKNOWN")
            start_time = time.time()
            
            sync_publish(Event(
                correlation_id=incident_id,
                agent_name=name,
                event_type=EventType.AGENT_STARTED,
                payload={"current_state": "started"}
            ))
            
            # 1. Capture Inputs
            inputs_blob = json.dumps({
                "alert_payload": state.get("alert_payload"),
                "tasks": state.get("tasks"),
                "prev_activity_count": len(state.get("activity", []))
            })

            try:
                # 2. Execute Agent
                output_state = fn(state)
                execution_time_ms = int((time.time() - start_time) * 1000)
                
                sync_publish(Event(
                    correlation_id=incident_id,
                    agent_name=name,
                    event_type=EventType.AGENT_COMPLETED,
                    payload={
                        "execution_time_ms": execution_time_ms,
                        "retry_count": 0,
                        "agent_dependencies": [],
                        "current_state": "completed"
                    }
                ))
                
                # 3. Capture Outputs & Persist
                with SessionLocal() as db:
                    snapshot_obj = models.ExecutionSnapshot(
                        incident_id=incident_id,
                        agent_name=name,
                        status="completed",
                        inputs_json=inputs_blob,
                        outputs_json=json.dumps(output_state, default=str)
                    )
                    db.add(snapshot_obj)
                    db.commit()
                
                # Merge snapshot events (don't overwrite agent's own snapshots)
                existing_snaps = output_state.get("snapshots") or []
                output_state["snapshots"] = existing_snaps + [{
                    "agent": name,
                    "status": "stored",
                    "message": f"{name.replace('_', ' ').title()} snapshot stored"
                }]
                return output_state
            except Exception as e:
                # 3. Attempt Autonomous Recovery
                from backend.core.recovery import recovery_orchestrator
                try:
                    output_state = recovery_orchestrator.attempt_recovery(e, name, state, fn)
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    
                    sync_publish(Event(
                        correlation_id=incident_id,
                        agent_name=name,
                        event_type=EventType.AGENT_COMPLETED,
                        payload={
                            "execution_time_ms": execution_time_ms,
                            "retry_count": state.get(f"{name}_retries", 1),
                            "agent_dependencies": [],
                            "current_state": "completed",
                            "recovered": True
                        }
                    ))
                    
                    with SessionLocal() as db:
                        snapshot_obj = models.ExecutionSnapshot(
                            incident_id=incident_id,
                            agent_name=name,
                            status="recovered",
                            inputs_json=inputs_blob,
                            outputs_json=json.dumps(output_state, default=str)
                        )
                        db.add(snapshot_obj)
                        db.commit()
                    
                    # Merge snapshot events (don't overwrite agent's own snapshots)
                    existing_snaps = output_state.get("snapshots") or []
                    output_state["snapshots"] = existing_snaps + [{
                        "agent": name,
                        "status": "recovered",
                        "message": f"{name.replace('_', ' ').title()} recovered successfully"
                    }]
                    return output_state
                    
                except Exception as final_e:
                    # 4. Handle Final Unrecoverable Failures
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    
                    sync_publish(Event(
                        correlation_id=incident_id,
                        agent_name=name,
                        event_type=EventType.AGENT_FAILED,
                        severity=EventSeverity.ERROR,
                        payload={
                            "execution_time_ms": execution_time_ms,
                            "retry_count": state.get(f"{name}_retries", 0),
                            "error_message": str(final_e),
                            "current_state": "failed"
                        }
                    ))

                    with SessionLocal() as db:
                        snapshot_obj = models.ExecutionSnapshot(
                            incident_id=incident_id,
                            agent_name=name,
                            status="failed",
                            inputs_json=inputs_blob,
                            error=str(final_e)
                        )
                        db.add(snapshot_obj)
                        db.commit()

                    # Return a safe partial dict — do NOT mutate state directly.
                    # LangGraph merges partial dicts via reducers. Direct mutation
                    # bypasses reducers and can corrupt shared graph state.
                    return {
                        "snapshots": [{
                            "agent": name,
                            "status": "failed",
                            "message": f"{name.replace('_', ' ').title()} failed: {str(final_e)[:200]}"
                        }],
                        "activity": [
                            f"[Execution] \U0001f4a5 {name} encountered a critical failure."
                        ],
                        "errors": [str(final_e)],
                    }
        return wrapped
    return decorator

_AGENTS = {
    "planner": planner_agent,
    "log_agent": log_agent,
    "trace_agent": trace_agent,
    "deploy_agent": deploy_agent,
    "memory_agent": memory_agent,
    "logging_agent": logging_agent,
    "recovery_agent": recovery_agent,
    "correlator": correlation_agent,
    "remediator": remediation_agent,
    "github_issue": github_issue_agent,
    "slack_notification": slack_notification_agent,
    "reporter": reporter_agent,
}

workflow = StateGraph(AgentState)

for _name, _fn in _AGENTS.items():
    workflow.add_node(_name, snapshot_wrapper(_name)(_fn))

workflow.set_entry_point("planner")


def route_from_planner(state: AgentState) -> List[str]:
    return ["log_agent", "trace_agent", "deploy_agent", "memory_agent"]


workflow.add_conditional_edges(
    "planner",
    route_from_planner,
    ["log_agent", "trace_agent", "deploy_agent", "memory_agent"],
)

# Specialists converge to Logging Agent
workflow.add_edge("log_agent", "logging_agent")
workflow.add_edge("trace_agent", "logging_agent")
workflow.add_edge("deploy_agent", "logging_agent")
workflow.add_edge("memory_agent", "logging_agent")

# Observer -> Recovery -> Correlator
workflow.add_edge("logging_agent", "recovery_agent")
workflow.add_edge("recovery_agent", "correlator")

workflow.add_edge("correlator", "remediator")
workflow.add_edge("remediator", "github_issue")
workflow.add_edge("github_issue", "slack_notification")
workflow.add_edge("slack_notification", "reporter")
workflow.add_edge("reporter", END)

app_graph = workflow.compile()


def run_investigation(incident_id: str, alert_payload: dict) -> dict:
    initial_state: AgentState = {
        "incident_id": incident_id,
        "alert_payload": alert_payload,
        "agent_outputs": {},
        "errors": [],
        "trace_spans": [],
        "activity": [],
        "tasks": [],
        "incident_timeline": [],
    }
    return app_graph.invoke(initial_state)
