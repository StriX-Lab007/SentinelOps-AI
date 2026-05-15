from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import asyncio

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
)
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SentinelOps AI")


@app.on_event("startup")
def _startup_omium():
    setup_omium()

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


def build_initial_state(incident_id: str, payload: AlertPayload):
    return {
        "incident_id": incident_id,
        "alert_payload": payload.model_dump(),
        "agent_outputs": {},
        "errors": [],
        "tasks": [],
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


async def run_investigation_job(incident_id: str, payload_data: dict):
    payload = AlertPayload(**payload_data)
    with omium_execution(incident_id):
        await app_graph.ainvoke(build_initial_state(incident_id, payload))


@app.get("/health")
def health_check():
    """Liveness probe — always returns {status: ok}."""
    return {"status": "ok"}


@app.get("/omium/status")
def get_omium_status():
    return omium_status()


@app.post("/webhook/alert")
@trace_webhook("webhook.alert")
async def receive_alert(payload: AlertPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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
    background_tasks.add_task(run_investigation_job, incident.id, payload.model_dump())

    return {"status": "accepted", "incident_id": incident.id}


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

    # Always start the background investigation so callers can poll
    # /incident/{id} without opening a WebSocket.
    background_tasks.add_task(run_investigation_job, incident.id, payload.model_dump())

    return {
        "status": "accepted",
        "incident_id": incident.id,
        "investigation": "background" if background else "websocket",
        "stream": f"/ws/incident/{incident.id}",
        "omium_dashboard_url": dashboard_url(incident.id) if is_enabled() else None,
    }


@app.websocket("/ws/incident/{incident_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str):
    await websocket.accept()

    payload = AlertPayload(
        service="checkout-api",
        severity="critical",
        incident_type="latency_spike",
        message="Latency spike detected (P99 > 2.4s)",
    )
    seed_demo_logs(payload.service)
    seed_demo_deployments(payload.service)
    initial_state = build_initial_state(incident_id, payload)

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
            async for output in app_graph.astream(initial_state):
                for node_name, state_update in output.items():
                    if not state_update:
                        continue

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

                    activities = state_update.get("activity", [])
                    output_str = activities[-1] if activities else ""
                    if not output_str:
                        if node_name == "correlator":
                            output_str = state_update.get("probable_root_cause", "")
                        elif node_name == "remediator":
                            output_str = state_update.get("remediation_action", "")
                        elif node_name == "reporter":
                            output_str = "RCA report generated."

                    if state_update.get("checkpoint_events"):
                        accumulated.setdefault("checkpoint_events", []).extend(
                            state_update["checkpoint_events"]
                        )

                    await websocket.send_json({
                        "node": node_name,
                        "status": "completed",
                        "output": output_str,
                        "activity": activities,
                        "trace_spans": state_update.get("trace_spans", []),
                        "tasks": accumulated.get("tasks", []),
                        "incident_timeline": accumulated.get("incident_timeline", []),
                        "checkpoint_events": accumulated.get("checkpoint_events", []),
                        "confidence_score": accumulated.get("confidence_score"),
                        "state": {**accumulated},
                        **omium_meta,
                    })

                    await asyncio.sleep(NODE_DELAYS.get(node_name, 0.15))

        await websocket.send_json({
            "node": "workflow",
            "status": "completed",
            "output": "Investigation complete",
            **omium_meta,
        })

    except WebSocketDisconnect:
        print(f"Client disconnected for incident {incident_id}")
    except Exception as e:
        print(f"Error in websocket for {incident_id}: {e}")
        await websocket.send_json({"error": str(e)})
        await websocket.close()
