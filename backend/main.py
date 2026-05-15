from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import asyncio

from backend import models
from backend.database import engine, get_db
from backend.agents.graph import app_graph
from fastapi.middleware.cors import CORSMiddleware

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SentinelOps AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AlertPayload(BaseModel):
    service: str
    severity: str
    incident_type: str
    message: Optional[str] = None


def build_initial_state(incident_id: str, payload: AlertPayload):
    return {
        "incident_id": incident_id,
        "service": payload.service,
        "severity": payload.severity,
        "incident_type": payload.incident_type,
        "alert_payload": payload.model_dump(),
        "plan": [],
        "logs": [],
        "traces": [],
        "deployments": [],
        "findings": [],
        "root_cause": "",
        "remediation": "",
        "report": "",
        "side_effects": [],
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
    await app_graph.ainvoke(build_initial_state(incident_id, payload))

@app.post("/webhook/alert")
async def receive_alert(payload: AlertPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Create incident record
    incident_label = payload.message or payload.incident_type.replace("_", " ")
    incident = models.Incident(
        title=f"Alert: {incident_label} on {payload.service}",
        severity=payload.severity,
        status="investigating"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    background_tasks.add_task(run_investigation_job, incident.id, payload.model_dump())

    return {"status": "accepted", "incident_id": incident.id}

@app.get("/incident/{incident_id}")
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Fetch remediation history
    history = db.query(models.RemediationHistory).filter(models.RemediationHistory.incident_id == incident_id).all()
    
    return {
        "incident": incident,
        "remediation_history": history
    }

@app.get("/report/{incident_id}")
def get_report(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if incident.status != "resolved" and not incident.summary:
        return {"message": "Report generation in progress."}
        
    return {"report": incident.summary}

@app.post("/simulate")
async def simulate_incident(db: Session = Depends(get_db)):
    # Seed mock data
    log1 = models.Log(
        service="checkout-api",
        level="ERROR",
        message="Database Connection Pool Exhaustion",
        timestamp=datetime.now(timezone.utc),
    )
    deploy1 = models.Deployment(
        service="checkout-api",
        version="v2.14.0",
        timestamp=datetime.now(timezone.utc),
        commit_hash="8f92a1c",
    )
    db.add_all([log1, deploy1])
    db.commit()

    # Trigger alert
    payload = AlertPayload(
        service="checkout-api",
        severity="critical",
        incident_type="latency_spike",
        message="Latency spike detected (P99 > 2.4s)",
    )
    
    # Create incident directly
    incident = models.Incident(
        title="P99 Latency Spike in checkout-api",
        severity=payload.severity,
        status="investigating"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    return {"status": "accepted", "incident_id": incident.id}

@app.websocket("/ws/incident/{incident_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str):
    await websocket.accept()

    payload = AlertPayload(
        service="checkout-api",
        severity="critical",
        incident_type="latency_spike",
        message="Latency spike detected (P99 > 2.4s)",
    )
    initial_state = build_initial_state(incident_id, payload)
    
    try:
        # LangGraph async stream
        async for output in app_graph.astream(initial_state):
            for node_name, state_update in output.items():
                
                # Because of our fan-in logic, skip empty updates
                if not state_update:
                    continue
                    
                # Format an output string based on the node that ran
                activities = state_update.get("activity", [])
                output_str = activities[-1] if activities else ""
                if not output_str:
                    if node_name == "correlator":
                        output_str = state_update.get("root_cause", "")
                    elif node_name == "remediator":
                        output_str = state_update.get("remediation", "")
                    elif node_name == "reporter":
                        output_str = "RCA report generated."

                # Send message to frontend
                await websocket.send_json({
                    "node": node_name,
                    "status": "completed",
                    "output": output_str,
                    "activity": activities,
                    "trace_spans": state_update.get("trace_spans", []),
                    "state": state_update # Send full state so frontend can get causal chain, etc.
                })
                
                # Small delay to ensure messages don't clump too perfectly
                await asyncio.sleep(0.1)
                
    except WebSocketDisconnect:
        print(f"Client disconnected for incident {incident_id}")
    except Exception as e:
        print(f"Error in websocket for {incident_id}: {e}")
        await websocket.send_json({"error": str(e)})
        await websocket.close()
