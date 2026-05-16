from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Request
from contextlib import asynccontextmanager
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import asyncio
import uuid
import json

from backend import models
from backend.database import engine, get_db
from backend.agents.graph import app_graph
from backend.tools.log_tools import seed_demo_logs
from backend.tools.deployment_tools import seed_demo_deployments
from backend.omium_tracing import (
    setup_omium,
    omium_execution,
    omium_status,
    dashboard_url,
    is_enabled,
    trace_webhook,
    trace_meta,
)
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)

ACTIVE_WEBSOCKETS: dict[str, list[WebSocket]] = {}
PENDING_APPROVALS: dict[str, dict] = {}

from backend.core.events import Event, EventType, event_bus

async def telemetry_subscriber(event: Event):
    # Forward telemetry events to active websockets
    if event.correlation_id in ACTIVE_WEBSOCKETS:
        payload = {
            "type": "telemetry_event",
            "event_type": event.event_type.value,
            "agent": event.agent_name,
            "severity": event.severity.value,
            "payload": event.payload,
            "timestamp": event.timestamp.isoformat()
        }
        for ws in ACTIVE_WEBSOCKETS[event.correlation_id]:
            try:
                await ws.send_json(payload)
            except Exception:
                pass

async def human_intervention_subscriber(event: Event):
    if event.event_type == EventType.HUMAN_INTERVENTION_REQUIRED:
        approval_data = {
            "incident_id": event.correlation_id,
            "agent": event.agent_name,
            "reason": event.payload.get("reason", "Unknown reason"),
            "confidence": event.payload.get("confidence", 0.0),
            "timestamp": event.timestamp.isoformat()
        }
        PENDING_APPROVALS[event.correlation_id] = approval_data
        
        # Broadcast to active websockets
        for ws in ACTIVE_WEBSOCKETS.get(event.correlation_id, []):
            try:
                await ws.send_json({
                    "type": "intervention_required",
                    **approval_data
                })
            except Exception:
                pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Omium tracing
    setup_omium()
    # Core event bus subscribers (default logger for all types)
    from backend.core.events import register_core_subscribers
    await register_core_subscribers()
    # Human-in-the-loop intervention forwarding
    await event_bus.subscribe(EventType.HUMAN_INTERVENTION_REQUIRED, human_intervention_subscriber)
    # Telemetry broadcast to active WebSockets for all event types
    for t in EventType:
        await event_bus.subscribe(t, telemetry_subscriber)
    yield

app = FastAPI(title="SentinelOps AI", lifespan=lifespan)

# --- Universal Webhook Integration ---
@app.post("/webhook/generic")
async def handle_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Universal webhook receiver for external alert sources.
    Supports Datadog, Grafana, PagerDuty, and Custom JSON.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    incident_id = f"INC-{uuid.uuid4().hex[:4].upper()}"
    
    # Log the arrival for observability
    print(f"[WEBHOOK] Received signal from external source. Assigned ID: {incident_id}")
    print(f"[WEBHOOK] Payload: {json.dumps(payload, indent=2)}")
    
    # In a production scenario, this would trigger the LangGraph orchestration
    # as a background task based on the payload mapping.
    
    return {
        "status": "success",
        "message": "Signal ingested into SentinelOps orchestration layer",
        "incident_id": incident_id,
        "source": payload.get("source", "generic_webhook"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


from backend.core.events import register_core_subscribers
# NOTE: Full startup logic is consolidated in the lifespan handler below (near line 197).

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NODE_DELAYS = {
    "planner": 0.3,
    "log_agent": 0.1,
    "trace_agent": 0.1,
    "deploy_agent": 0.1,
    "memory_agent": 0.1,
    "correlator": 0.4,
    "remediator": 0.3,
    "github_issue": 0.2,
    "slack_notification": 0.2,
    "reporter": 0.2,
}


class AlertPayload(BaseModel):
    service: str
    severity: str
    incident_type: str
    message: Optional[str] = None


def build_initial_state(incident_id: str, payload: AlertPayload, simulate_failures: str = ""):
    return {
        "incident_id": incident_id,
        "alert_payload": payload.model_dump(),
        "agent_outputs": {},
        "errors": [],
        "tasks": [],
        "simulate_failures": simulate_failures,
        "incident_timeline": [],
        "trace_spans": [
            {
                "name": "webhook_received",
                "parent": None,
                "status": "completed",
                "output": f"{payload.severity} {payload.incident_type} alert for {payload.service}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "activity": [f"[Webhook] {payload.severity} {payload.incident_type} alert received for {payload.service}"],
    }


async def run_investigation_job(incident_id: str, payload_data: dict, simulate_failures: str = ""):
    payload = AlertPayload(**payload_data)
    try:
        with omium_execution(incident_id):
            await app_graph.ainvoke(build_initial_state(incident_id, payload, simulate_failures))
    except Exception as exc:
        # Mark the incident as failed so it doesn't stay stuck in 'investigating'.
        print(f"[run_investigation_job] Unhandled error for {incident_id}: {exc}")
        try:
            from backend.agents.db_utils import update_incident_status
            update_incident_status(incident_id, "failed")
        except Exception:
            pass


@app.get("/health")
def health_check():
    """Liveness probe — always returns {status: ok}."""
    return {"status": "ok"}


@app.get("/omium/status")
def get_omium_status():
    return omium_status()


@app.post("/webhook/alert")
async def receive_webhook(payload: AlertPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    incident_label = payload.message or payload.incident_type.replace("_", " ")
    incident = models.Incident(
        title=f"Alert: {incident_label} on {payload.service}",
        severity=payload.severity,
        status="investigating",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    seed_demo_logs(payload.service)
    seed_demo_deployments(payload.service)
    incident_id: str = incident.id
    background_tasks.add_task(run_investigation_job, incident_id, payload.model_dump())

# subscribers and app relocated above

class ApprovalRequest(BaseModel):
    action: str

@app.get("/api/v1/recovery/pending")
async def get_pending_approvals():
    return {"pending": list(PENDING_APPROVALS.values())}

@app.post("/api/v1/recovery/{incident_id}/approve")
async def approve_recovery(incident_id: str):
    if incident_id not in PENDING_APPROVALS:
        raise HTTPException(status_code=404, detail="No pending approval found")
    
    approval = PENDING_APPROVALS.pop(incident_id)
    # Broadcast to connected websockets
    for ws in ACTIVE_WEBSOCKETS.get(incident_id, []):
        try:
            await ws.send_json({
                "type": "intervention_resolved",
                "incident_id": incident_id,
                "status": "approved",
                "agent": approval["agent"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass
    return {"status": "approved", "incident_id": incident_id}

@app.post("/api/v1/recovery/{incident_id}/reject")
async def reject_recovery(incident_id: str):
    if incident_id not in PENDING_APPROVALS:
        raise HTTPException(status_code=404, detail="No pending approval found")
    
    approval = PENDING_APPROVALS.pop(incident_id)
    for ws in ACTIVE_WEBSOCKETS.get(incident_id, []):
        try:
            await ws.send_json({
                "type": "intervention_resolved",
                "incident_id": incident_id,
                "status": "rejected",
                "agent": approval["agent"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass
    return {"status": "rejected", "incident_id": incident_id}


@app.get("/incident/{incident_id}")
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    history = db.query(models.RemediationHistory).filter(
        models.RemediationHistory.incident_id == incident_id
    ).all()

    return {"incident": incident, "remediation_history": history}


@app.get("/report/{incident_id}")
def get_report(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.status != "resolved" and not incident.summary:
        return {"message": "Report generation in progress."}

    return {"report": incident.summary}


@app.get("/report/{incident_id}/download")
def download_report(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident or not incident.summary:
        raise HTTPException(status_code=404, detail="Report not ready")
    return PlainTextResponse(
        incident.summary,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="incident-{incident_id}.md"'},
    )


@app.post("/simulate")
async def simulate_incident(
    background_tasks: BackgroundTasks,
    background: bool = False,
    simulate_failures: str = "",
    db: Session = Depends(get_db),
):
    service = "checkout-api"
    seed_demo_logs(service)
    seed_demo_deployments(service)

    payload = AlertPayload(
        service=service,
        severity="critical",
        incident_type="latency_spike",
        message="Latency spike detected (P99 > 2.4s)",
    )

    incident = models.Incident(
        title="P99 Latency Spike in checkout-api",
        severity=payload.severity,
        status="investigating",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    incident_id: str = incident.id
    # Only start background investigation if explicitly requested,
    # otherwise the WebSocket endpoint will handle the execution.
    if background:
        background_tasks.add_task(run_investigation_job, incident_id, payload.model_dump(), simulate_failures)

    import urllib.parse
    stream_qs = f"?simulate_failures={urllib.parse.quote(simulate_failures)}" if simulate_failures else ""
    return {
        "status": "accepted",
        "incident_id": incident_id,
        "investigation": "background" if background else "websocket",
        "stream": f"/ws/incident/{incident_id}{stream_qs}",
        "omium_dashboard_url": dashboard_url(incident_id) if is_enabled() else None,
    }


@app.websocket("/ws/incident/{incident_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str, simulate_failures: str = ""):
    await websocket.accept()
    ACTIVE_WEBSOCKETS.setdefault(incident_id, []).append(websocket)
    
    try:
        payload = AlertPayload(
            service="checkout-api",
            severity="critical",
            incident_type="latency_spike",
            message="Latency spike detected (P99 > 2.4s)",
        )
        seed_demo_logs(payload.service)
        seed_demo_deployments(payload.service)
        initial_state = build_initial_state(incident_id, payload, simulate_failures)
    except Exception as init_e:
        await websocket.send_json({"error": f"Failed to initialize investigation: {init_e}"})
        await websocket.close()
        return

    accumulated: dict = {}
    omium_meta = {
        "omium_enabled": is_enabled(),
        "omium_execution_id": incident_id,
        "omium_dashboard_url": dashboard_url(incident_id) if is_enabled() else None,
    }

    await websocket.send_json({
        "node": "workflow",
        "status": "started",
        "output": "Investigation started",
        **omium_meta,
    })


    try:
        with omium_execution(incident_id):
            # 1. Start the Planner
            await websocket.send_json({
                "type": "agent_started",
                "agent": "planner",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            async for output in app_graph.astream(initial_state):
                for node_name, state_update in output.items():
                    if not state_update:
                        continue

                    # Update local accumulation for state consistency
                    for key, val in state_update.items():
                        if key == "activity" and isinstance(val, list):
                            accumulated.setdefault("activity", []).extend(val)
                        elif key == "trace_spans" and isinstance(val, list):
                            accumulated.setdefault("trace_spans", []).extend(val)
                        elif key == "incident_timeline" and isinstance(val, list):
                            accumulated["incident_timeline"] = val
                        elif key == "tasks":
                            accumulated["tasks"] = val
                        else:
                            accumulated[key] = val

                    if state_update.get("checkpoint_events"):
                        accumulated.setdefault("checkpoint_events", []).extend(
                            state_update["checkpoint_events"]
                        )

                    if node_name == "planner":
                        # 2b. Planner Structured Output
                        tasks = state_update.get("tasks", [])
                        await websocket.send_json({
                            "type": "planner_output",
                            "incident_type": state_update.get("incident_type", "unknown_regression"),
                            "tasks": [
                                {"agent": t.get("assigned_agent", "unknown"), "objective": t.get("objective", "")}
                                for t in tasks if isinstance(t, dict)
                            ],
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                        # Psychological Trigger: Parallel Launch Announcement
                        await websocket.send_json({
                            "type": "activity",
                            "message": "Orchestrator activating parallel investigation swarm...",
                            "severity": "success",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                        # Predictive Start for specialists
                        for agent in ["log_agent", "trace_agent", "deploy_agent", "memory_agent"]:
                            await websocket.send_json({
                                "type": "agent_started",
                                "agent": agent,
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            })

                    # 2. Activity Events
                    for act in state_update.get("activity", []):
                        await websocket.send_json({
                            "type": "activity",
                            "message": act,
                            "severity": "info" if "checkpoint" not in act.lower() else "success",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 2c. Root Cause Update
                    if node_name == "correlator":
                        await websocket.send_json({
                            "type": "root_cause_update",
                            "rootCause": state_update.get("causal_chain", "Causal analysis complete"),
                            "confidence": state_update.get("confidence_score", 0.0),
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 2d. Remediation Update
                    if node_name == "remediator":
                        await websocket.send_json({
                            "type": "remediation_update",
                            "remediation": state_update.get("remediation_action", "Remediation plan generated"),
                            "remediation_command": state_update.get("remediation_command"),
                            "requires_approval": state_update.get("requires_approval", False),
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 3. Confidence Update
                    if "confidence_score" in state_update:
                        await websocket.send_json({
                            "type": "confidence_update",
                            "value": state_update["confidence_score"],
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 4. Timeline Events
                    for tl in state_update.get("incident_timeline", []):
                        # Only send if it's new or updated? For now, send full list or handle in store.
                        # But protocol says "timeline_event". Let's send the latest one or use a "timeline" update.
                        # The store handles the list, but let's send individual events if they were just added.
                        await websocket.send_json({
                            "type": "timeline_event",
                            "title": tl["event"],
                            "time": tl["time"],
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 5. Integration Events
                    if node_name in ["github_issue", "slack_notification"]:
                        await websocket.send_json({
                            "type": "integration",
                            "service": "github" if node_name == "github_issue" else "slack",
                            "status": "completed",
                            "message": f"{'GitHub issue' if node_name == 'github_issue' else 'Slack alert'} dispatched successfully",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 5b. Snapshot Events
                    for snap in state_update.get("snapshots", []):
                        await websocket.send_json({
                            "type": "snapshot_event",
                            "agent": snap["agent"],
                            "status": snap["status"],
                            "message": snap["message"],
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # 6. Agent Completed
                    output_str = state_update.get("activity")[-1] if state_update.get("activity") else ""
                    if not output_str:
                        if node_name == "correlator":
                            output_str = state_update.get("probable_root_cause", "Evidence correlation complete")
                        elif node_name == "remediator":
                            output_str = state_update.get("remediation_action", "Remediation plan generated")
                        elif node_name == "reporter":
                            output_str = "RCA report finalized"
                        else:
                            output_str = f"{node_name.replace('_', ' ').title()} completed"

                    await websocket.send_json({
                        "type": "agent_completed",
                        "agent": node_name,
                        "summary": output_str,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })

                    # 7. Predictive Started Events
                    next_agents = []
                    if node_name == "planner":
                        next_agents = ["log_agent", "trace_agent", "deploy_agent", "memory_agent"]
                    elif node_name in ["log_agent", "trace_agent", "deploy_agent", "memory_agent"]:
                        # Check if all specialists are done? The backend loop will process them one by one.
                        # If this is the last specialist, start correlator.
                        # For simplicity, if we haven't started correlator, we can start it here if it's the next node.
                        # But LangGraph handles the flow. Let's just start the next node in the logical sequence.
                        pass
                    elif node_name == "correlator":
                        next_agents = ["remediator"]
                    elif node_name == "remediator":
                        next_agents = ["github_issue", "slack_notification"]
                    elif node_name in ["github_issue", "slack_notification"]:
                        # Check if both are done?
                        pass

                    for na in next_agents:
                        await websocket.send_json({
                            "type": "agent_started",
                            "agent": na,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    # Special handling for reporter start
                    if node_name == "slack_notification":
                         await websocket.send_json({
                            "type": "agent_started",
                            "agent": "reporter",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })

                    await asyncio.sleep(NODE_DELAYS.get(node_name, 0.15))

        await websocket.send_json({
            "type": "activity",
            "message": "Investigation complete — RCA report generated",
            "severity": "success",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    except WebSocketDisconnect:
        print(f"Client disconnected for incident {incident_id}")
    except Exception as e:
        print(f"Error in websocket for {incident_id}: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass
    finally:
        # Remove BEFORE closing so telemetry subscribers stop sending immediately.
        ws_list = ACTIVE_WEBSOCKETS.get(incident_id)
        if ws_list and websocket in ws_list:
            ws_list.remove(websocket)
        # Prune empty lists to avoid unbounded dict growth.
        if ws_list is not None and not ws_list:
            ACTIVE_WEBSOCKETS.pop(incident_id, None)

        try:
            await websocket.close()
        except Exception:
            pass
