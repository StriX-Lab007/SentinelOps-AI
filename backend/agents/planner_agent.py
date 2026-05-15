"""
agents/planner_agent.py
-----------------------------------------------------------------
Planner Agent - analyses incoming alerts and builds an execution 
plan for the specialist agents.

Phase 2: LLM Integration (Gemini/OpenAI) with rule-based fallback.
-----------------------------------------------------------------
"""
from __future__ import annotations
import os
from typing import Any, Dict, List, Optional
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
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .state import AgentState
from .db_utils import update_incident_status
from backend.omium_tracing import invoke_with_trace
from .tasks import default_investigation_tasks, tasks_to_dicts
from .timeline import append_timeline, timeline_event
from backend.tools.web_search_tools import search_incident_context

# -- LLM Schema -------------------------------------------------------------

class ExecutionTask(BaseModel):
    agent: str = Field(description="Agent node name, e.g. log_agent")
    goal: str = Field(description="Objective for this agent")

class PlannerOutput(BaseModel):
    incident_type: str = Field(description="The classified type of incident.")
    priority: str = Field(description="Priority: critical, high, medium, or low.")
    plan: List[str] = Field(description="Ordered list of agent nodes to run.")
    execution_plan: List[ExecutionTask] = Field(default_factory=list)

# -- Rule-based Fallback (Phase 1 logic) ------------------------------------

def _plan_rule_based(alert_message: str) -> Dict[str, Any]:
    msg = alert_message.lower()
    
    # Defaults
    itype = "unknown"
    priority = "medium"
    
    if any(k in msg for k in ("latency", "slow", "timeout", "p99")):
        itype = "latency_spike"
        priority = "high"
    elif any(k in msg for k in ("deploy", "regression", "version", "rollout")):
        itype = "deploy_regression"
        priority = "high"
    elif any(k in msg for k in ("oom", "memory", "heap", "crash")):
        itype = "oom_crash"
        priority = "critical"
    elif any(k in msg for k in ("db", "query", "pool", "connection")):
        itype = "dependency_failure"
        priority = "high"

    # Plan is always the same for now to ensure stability
    plan = [
        "log_agent",
        "deploy_agent",
        "trace_agent",
        "correlation_agent",
        "memory_agent",
        "remediation_agent",
        "reporter_agent"
    ]
    
    return {
        "incident_type": itype,
        "priority": priority,
        "plan": plan
    }

# -- LLM Planner ------------------------------------------------------------

_PROMPT = """\
You are the SentinelOps Dispatcher. Your job is to analyze an incoming infrastructure alert and decide which investigative agents should be triggered.

ALERT:
Service: {service}
Severity: {severity}
Message: {message}

AVAILABLE AGENTS:
- log_agent: Analyzes service logs for errors.
- deploy_agent: Checks for recent code deployments.
- trace_agent: Inspects distributed traces for latency/errors.
- memory_agent: Looks for similar past incidents.
- correlation_agent: Synthesizes all evidence (MANDATORY).
- remediation_agent: Recommends a fix (MANDATORY).
- reporter_agent: Finalizes the report (MANDATORY).

TASK:
1. Classify the incident_type (e.g. latency_spike, deploy_regression, oom_crash, etc).
2. Assign a priority (critical, high, medium, low).
3. Build the execution plan as an ordered list of agent names.

{format_instructions}
"""

def _plan_llm(service: str, severity: str, message: str) -> Optional[Dict[str, Any]]:
    """Attempt LLM planning using Gemini or OpenAI."""
    try:
        google_key = os.getenv("GOOGLE_API_KEY")
        openai_key = os.getenv("OPENAI_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        
        llm = None
        if google_key:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", google_api_key=google_key)
        elif groq_key:
            from langchain_groq import ChatGroq
            llm = ChatGroq(model="llama3-70b-8192", groq_api_key=groq_key)
        elif openai_key:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(model="gpt-4-turbo-preview", openai_api_key=openai_key)
        
        if not llm:
            return None

        parser = JsonOutputParser(pydantic_object=PlannerOutput)
        prompt = ChatPromptTemplate.from_template(_PROMPT)
        
        chain = prompt | llm | parser
        
        result = invoke_with_trace(chain, {
            "service": service,
            "severity": severity,
            "message": message,
            "format_instructions": parser.get_format_instructions(),
        })
        return result
    except Exception as e:
        print(f"[PlannerAgent] LLM failed: {e}")
        return None

# -- Node -------------------------------------------------------------------

def planner_agent(state: AgentState) -> AgentState:
    """LangGraph node - analyses alert and produces a plan."""
    print("[PlannerAgent] Analysing alert...")
    
    incident_id = state.get("incident_id")
    update_incident_status(incident_id, "planning")

    try:
        payload = state.get("alert_payload", {})
        service = payload.get("service", "unknown")
        severity = payload.get("severity", "medium")
        message = payload.get("message", "")

        # 1. Try LLM
        llm_result = _plan_llm(service=service, severity=severity, message=message)
        used_llm = llm_result is not None

        # 2. Fallback
        if not llm_result:
            print("[PlannerAgent] Using rule-based fallback logic.")
            result = _plan_rule_based(alert_message=message)
        else:
            print("[PlannerAgent] LLM planning successful.")
            result = llm_result

        incident_type = result.get("incident_type", "unknown")
        priority = result.get("priority", "medium")
        plan = result.get("plan", [])

        tasks = default_investigation_tasks(incident_type)
        for t in tasks:
            t.status = "running"
        task_dicts = tasks_to_dicts(tasks)

        search_hits = search_incident_context(f"{service} {incident_type} {message}")
        web_ctx = "; ".join(h.get("snippet", "") for h in search_hits[:2])

        print(f"[PlannerAgent] service={service}  type={incident_type}  "
              f"priority={priority}  plan={plan}")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["planner_agent"] = {
            "engine": "llm" if used_llm else "rules",
            "incident_type": incident_type,
            "priority": priority,
            "plan": plan,
            "execution_plan": task_dicts,
        }

        timeline = [
            timeline_event(f"Webhook received — {severity} alert on {service}", "critical"),
            timeline_event(f"Planner classified incident as {incident_type.replace('_', ' ')}", "info"),
            timeline_event("Evidence agents dispatched in parallel", "info"),
        ]

        return {
            "incident_type": incident_type,
            "priority":      priority,
            "plan":          plan,
            "tasks":         task_dicts,
            "web_search_context": web_ctx,
            "agent_outputs": agent_outputs,
            "trace_spans": [_span("planner_agent", "webhook_received", output=f"Classified {incident_type} on {service}")],
            "activity": [
                f"[Planner] Incident classified as {incident_type.replace('_', ' ')}",
                "[Planner] Dispatched Log, Trace, Deploy, and Memory investigations",
            ],
            "incident_timeline": timeline,
        }
    except Exception as e:
        error_msg = f"PlannerAgent error: {e}"
        print(f"[PlannerAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias
planner_agent_node = planner_agent
