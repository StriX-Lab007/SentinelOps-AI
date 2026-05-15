"""Explicit task objects for orchestration visibility."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InvestigationTask(BaseModel):
    id: str
    assigned_agent: str
    objective: str
    status: str = "pending"  # pending | running | completed | failed | retried
    findings: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    trace_parent: str = "planner_agent"


def default_investigation_tasks(incident_type: str) -> List[InvestigationTask]:
    return [
        InvestigationTask(
            id="log-01",
            assigned_agent="log_agent",
            objective="Identify timeout and pool exhaustion patterns in service logs",
        ),
        InvestigationTask(
            id="trace-01",
            assigned_agent="trace_agent",
            objective="Reconstruct dependency bottleneck from distributed traces",
        ),
        InvestigationTask(
            id="deploy-01",
            assigned_agent="deploy_agent",
            objective="Detect recent deployment regression candidates",
        ),
        InvestigationTask(
            id="memory-01",
            assigned_agent="memory_agent",
            objective="Retrieve similar past incidents and successful remediations",
        ),
    ]


def tasks_to_dicts(tasks: List[InvestigationTask]) -> List[Dict[str, Any]]:
    return [t.model_dump() for t in tasks]


def update_task_status(
    tasks: List[Dict[str, Any]],
    agent: str,
    status: str,
    finding: Optional[str] = None,
) -> List[Dict[str, Any]]:
    updated = []
    for t in tasks:
        row = dict(t)
        if row.get("assigned_agent") == agent:
            row["status"] = status
            if finding:
                findings = list(row.get("findings") or [])
                findings.append(finding)
                row["findings"] = findings
        updated.append(row)
    return updated
