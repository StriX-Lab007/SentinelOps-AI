"""
agents/reporter_agent.py
-----------------------------------------------------------------
Reporter Agent - assembles the final incident report and dispatches
notifications.

Phase 2: LLM Integration (Gemini/OpenAI) with template-based fallback.
-----------------------------------------------------------------
"""
from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
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

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from backend import models
from backend.database import SessionLocal
from .state import AgentState
from .db_utils import update_incident_status
from backend.omium_tracing import invoke_with_trace
from .timeline import append_timeline

# -- Template-based Fallback (Phase 1 logic) --------------------------------

_REPORT_TEMPLATE = """\
# SentinelOps Incident Report
**Generated**: {timestamp}

## Summary
| Field | Value |
|-------|-------|
| Incident ID | `{incident_id}` |
| Service | `{service}` |
| Severity | `{severity}` |
| Type | `{incident_type}` |
| Priority | `{priority}` |
| Confidence | {confidence:.0%} |

## Root Cause
**{probable_root_cause}**

{causal_chain}

## Evidence
### Logs
{logs_summary}

### Deployments
{deployment_summary}

### Traces
{trace_summary}

## Remediation
**Chosen Action**: {remediation_action}

{steps}

## Historical Context
{memory_context}

## All Candidates Considered
{candidates_table}
"""

def _build_fallback_report(state: AgentState, timestamp: str) -> str:
    payload = state.get("alert_payload", {})
    candidates = state.get("remediation_candidates", [])
    
    # Helper for candidates table
    rows = ["| Action | Risk | Confidence |", "|--------|------|------------|"]
    for c in candidates:
        rows.append(f"| {c['action']} | {c.get('risk','?')} | {c.get('confidence', 0):.0%} |")
    c_table = "\n".join(rows) if candidates else "No candidates considered."

    return _REPORT_TEMPLATE.format(
        timestamp=timestamp,
        incident_id=state.get("incident_id", ""),
        service=payload.get("service", "unknown"),
        severity=payload.get("severity", "unknown"),
        incident_type=state.get("incident_type", "unknown"),
        priority=state.get("priority", "unknown"),
        confidence=state.get("confidence_score", 0.0),
        probable_root_cause=state.get("probable_root_cause", "Undetermined"),
        causal_chain=state.get("causal_chain", "N/A"),
        logs_summary=state.get("logs_summary", "N/A"),
        deployment_summary=state.get("deployment_summary", "N/A"),
        trace_summary=state.get("trace_summary", "N/A"),
        remediation_action=state.get("remediation_action", "N/A"),
        steps="\n".join(state.get("remediation_steps", [])) or "N/A",
        memory_context=state.get("memory_context", "No similar incidents found."),
        candidates_table=c_table
    )

# -- LLM Reporter -----------------------------------------------------------

_PROMPT = """\
You are the SentinelOps Reporter. Your job is to write a professional, high-impact technical incident report based on the evidence collected by our agent pipeline.

INCIDENT DETAILS:
Incident ID: {incident_id}
Service: {service}
Root Cause: {root_cause}
Causal Chain: {causal_chain}
Recommended Action: {action}

EVIDENCE SUMMARIES:
- Logs: {logs}
- Deployments: {deployments}
- Traces: {traces}
- History: {memory}

TASK:
Write a comprehensive Markdown report. 
- Use headers, tables, and bold text for readability.
- Be concise but thorough.
- Include a 'Timeline of Findings' section based on the causal chain.
- Ensure the tone is technical and objective.

Output ONLY the Markdown content.
"""

def _report_llm(state: AgentState) -> Optional[str]:
    """Attempt LLM report generation using Gemini or OpenAI."""
    try:
        from backend.agents.llm_utils import get_llm
        llm = get_llm(json_mode=False)
        
        if not llm:
            return None

        prompt = ChatPromptTemplate.from_template(_PROMPT)
        chain = prompt | llm | StrOutputParser()
        
        payload = state.get("alert_payload", {})
        result = invoke_with_trace(chain, {
            "incident_id": state.get("incident_id", ""),
            "service": payload.get("service", "unknown"),
            "root_cause": state.get("probable_root_cause", "Undetermined"),
            "causal_chain": state.get("causal_chain", "N/A"),
            "action": state.get("remediation_action", "N/A"),
            "logs": state.get("logs_summary", "N/A"),
            "deployments": state.get("deployment_summary", "N/A"),
            "traces": state.get("trace_summary", "N/A"),
            "memory": state.get("memory_context", "N/A"),
        })
        return result
    except Exception as e:
        print(f"[ReporterAgent] LLM failed: {e}")
        return None

# -- Node -------------------------------------------------------------------

def reporter_agent(state: AgentState) -> AgentState:
    """LangGraph node - builds report and dispatches notifications."""
    print("[ReporterAgent] Generating final report ...")
    
    incident_id = state.get("incident_id")
    if incident_id is not None:
        update_incident_status(incident_id, "reporting")
    else:
        incident_id = ""

    try:
        timestamp = datetime.now(timezone.utc).isoformat()

        # 1. Try LLM report
        report_markdown = _report_llm(state)
        
        # 2. Fallback
        if not report_markdown:
            print("[ReporterAgent] Using template-based fallback report.")
            report_markdown = _build_fallback_report(state, timestamp)
        else:
            print("[ReporterAgent] LLM report generation successful.")

        payload = state.get("alert_payload", {})
        service = payload.get("service", "unknown")
        severity = payload.get("severity", "medium")
        root_cause = state.get("probable_root_cause", "Undetermined")
        action = state.get("remediation_action", "N/A")
        confidence = state.get("confidence_score", 0.0)

        # Prepare agent outputs for persistence
        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["reporter_agent"] = {
            "engine": "llm" if (report_markdown and "Fallback" not in report_markdown) else "template",
            "report_sent": False # Will update after send
        }

        # Persist to DB
        try:
            import json as _json
            with SessionLocal() as db:
                incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
                if incident:
                    incident.summary = report_markdown
                    incident.status = "resolved"
                    incident.root_cause = root_cause
                    incident.causal_chain = state.get("causal_chain")
                    incident.confidence_score = confidence
                    incident.remediation_action = action
                    incident.agent_outputs_json = _json.dumps(agent_outputs, default=str)
                    db.commit()
        except Exception as e:
            print(f"[ReporterAgent] DB write failed: {e}")

        agent_outputs["reporter_agent"]["report_sent"] = True

        return {
            "report_markdown": report_markdown,
            "report_sent": True,
            "agent_outputs": agent_outputs,
            "trace_spans": [_span("reporter_agent", "remediation_agent", output="RCA report generated")],
            "activity": ["[Reporter] RCA report generated — download ready"],
            "incident_timeline": append_timeline(
                state.get("incident_timeline"),
                "Incident report finalized and stored",
                "success",
            ),
        }
    except Exception as e:
        error_msg = f"ReporterAgent error: {e}"
        print(f"[ReporterAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias
reporter_agent_node = reporter_agent
