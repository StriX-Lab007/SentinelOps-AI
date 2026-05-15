from datetime import datetime, timezone
import asyncio
import operator
from typing import Any, Dict, List, TypedDict
from typing_extensions import Annotated

from langgraph.graph import END, StateGraph

from backend import models
from backend.database import SessionLocal


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


class IncidentState(TypedDict, total=False):
    incident_id: str
    service: str
    severity: str
    incident_type: str
    alert_payload: Dict[str, Any]
    plan: List[str]
    logs: Annotated[List[Dict[str, Any]], operator.add]
    traces: Annotated[List[Dict[str, Any]], operator.add]
    deployments: Annotated[List[Dict[str, Any]], operator.add]
    findings: Annotated[List[str], operator.add]
    root_cause: str
    remediation: str
    report: str
    side_effects: Annotated[List[Dict[str, Any]], operator.add]
    trace_spans: Annotated[List[Dict[str, Any]], operator.add]
    activity: Annotated[List[str], operator.add]


async def planner_node(state: IncidentState):
    await asyncio.sleep(0.8)
    service = state.get("service", "unknown-service")
    incident_type = state.get("incident_type", "unknown_incident")
    return {
        "plan": [
            "classify_incident",
            "investigate_logs",
            "inspect_traces",
            "check_recent_deployments",
            "correlate_evidence",
            "recommend_remediation",
            "notify_operators",
            "generate_rca_report",
        ],
        "trace_spans": [_span("planner_agent", "webhook_received", output=f"Classified {incident_type} on {service}")],
        "activity": ["[Planner] Incident classified and evidence agents dispatched"],
    }


async def log_agent_node(state: IncidentState):
    await asyncio.sleep(2.5)
    service = state.get("service", "checkout-api")
    finding = f"Timeout and connection-pool errors clustered around {service}."
    return {
        "logs": [
            {"service": service, "level": "ERROR", "message": "DB connection pool exhausted after request timeout"}
        ],
        "findings": [finding],
        "trace_spans": [_span("log_agent", "planner_agent", output=finding)],
        "activity": ["[Log Agent] Timeout spike detected in service logs"],
    }


async def trace_agent_node(state: IncidentState):
    await asyncio.sleep(1.5)
    service = state.get("service", "checkout-api")
    finding = "Checkout request spans show database wait time dominating P99 latency."
    return {
        "traces": [
            {"service": service, "span": "checkout.db.query", "p99_ms": 2400, "anomaly": "db_wait_time"}
        ],
        "findings": [finding],
        "trace_spans": [_span("trace_agent", "planner_agent", output=finding)],
        "activity": ["[Trace Agent] Span anomaly isolated in checkout database path"],
    }


async def deploy_agent_node(state: IncidentState):
    await asyncio.sleep(2.0)
    service = state.get("service", "checkout-api")
    finding = f"Recent deployment v2.14.0 touched database pooling code for {service}."
    return {
        "deployments": [
            {
                "service": service,
                "version": "v2.14.0",
                "commit_hash": "8f92a1c",
                "timestamp": _now_iso(),
            }
        ],
        "findings": [finding],
        "trace_spans": [_span("deployment_agent", "planner_agent", output=finding)],
        "activity": ["[Deployment Agent] Recent deployment identified as suspect"],
    }


async def run_evidence_agents_concurrently(state: IncidentState):
    return await asyncio.gather(
        log_agent_node(state),
        trace_agent_node(state),
        deploy_agent_node(state),
    )


async def correlator_node(state: IncidentState):
    await asyncio.sleep(1.0)
    service = state.get("service", "checkout-api")
    root_cause = (
        f"Deployment v2.14.0 introduced a database connection leak in {service}, "
        "causing pool exhaustion and checkout P99 latency above 2.4s."
    )
    return {
        "root_cause": root_cause,
        "findings": ["Evidence from logs, traces, and deployment history converged with 92% confidence."],
        "trace_spans": [_span("correlation_agent", "planner_agent", output=root_cause)],
        "activity": ["[Correlation] Root cause confidence reached 92%"],
    }


async def remediator_node(state: IncidentState):
    await asyncio.sleep(0.8)
    service = state.get("service", "checkout-api")
    remediation = f"Rollback {service} to v2.13.9 and verify database pool saturation returns below 70%."
    return {
        "remediation": remediation,
        "trace_spans": [_span("remediation_agent", "correlation_agent", output=remediation)],
        "activity": ["[Remediation] Rollback recommendation prepared"],
    }


async def github_issue_node(state: IncidentState):
    await asyncio.sleep(0.5)
    incident_id = state.get("incident_id", "unknown")
    issue_key = f"GITHUB-{incident_id[:8]}"
    return {
        "side_effects": [{"type": "github_issue", "id": issue_key, "status": "created"}],
        "trace_spans": [_span("github_issue_created", "remediation_agent", output=issue_key)],
        "activity": [f"[GitHub] Issue {issue_key} created for rollback follow-up"],
    }


async def slack_notification_node(state: IncidentState):
    await asyncio.sleep(0.4)
    return {
        "side_effects": [{"type": "slack_notification", "channel": "#incident-response", "status": "sent"}],
        "trace_spans": [_span("slack_notification_sent", "remediation_agent", output="#incident-response")],
        "activity": ["[Slack] Incident response channel notified"],
    }


async def reporter_node(state: IncidentState):
    await asyncio.sleep(0.6)
    incident_id = state["incident_id"]
    root_cause = state.get("root_cause", "")
    remediation = state.get("remediation", "")
    report = (
        f"# RCA Report - {incident_id}\n\n"
        f"## Root Cause\n{root_cause}\n\n"
        f"## Remediation\n{remediation}\n\n"
        "## Side Effects\n"
        "- GitHub rollback follow-up created\n"
        "- Slack incident response notification sent\n"
    )

    db = SessionLocal()
    try:
        incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
        if incident:
            incident.summary = report
            incident.status = "resolved"
            rem = models.RemediationHistory(
                incident_id=incident.id,
                action=remediation,
                outcome="Pending execution",
                confidence=0.92,
            )
            db.add(rem)
            db.commit()
    finally:
        db.close()

    return {
        "report": report,
        "trace_spans": [_span("reporter_agent", "remediation_agent", output="RCA report generated")],
        "activity": ["[Reporter] RCA report generated"],
    }


workflow = StateGraph(IncidentState)

workflow.add_node("planner", planner_node)
workflow.add_node("log_agent", log_agent_node)
workflow.add_node("trace_agent", trace_agent_node)
workflow.add_node("deploy_agent", deploy_agent_node)
workflow.add_node("correlator", correlator_node)
workflow.add_node("remediator", remediator_node)
workflow.add_node("github_issue", github_issue_node)
workflow.add_node("slack_notification", slack_notification_node)
workflow.add_node("reporter", reporter_node)

workflow.set_entry_point("planner")


def route_from_planner(state: IncidentState):
    return ["log_agent", "trace_agent", "deploy_agent"]


workflow.add_conditional_edges(
    "planner",
    route_from_planner,
    ["log_agent", "trace_agent", "deploy_agent"],
)

workflow.add_edge("log_agent", "correlator")
workflow.add_edge("trace_agent", "correlator")
workflow.add_edge("deploy_agent", "correlator")
workflow.add_edge("correlator", "remediator")
workflow.add_edge("remediator", "github_issue")
workflow.add_edge("remediator", "slack_notification")
workflow.add_edge("github_issue", "reporter")
workflow.add_edge("slack_notification", "reporter")
workflow.add_edge("reporter", END)

app_graph = workflow.compile()
