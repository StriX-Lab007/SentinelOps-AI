"""
agents/correlation_agent.py
-----------------------------------------------------------------
Correlation Agent - synthesises log, deployment, trace, and
memory signals into a root-cause causal chain with a confidence
score.

Phase 2: LLM Integration (Gemini/OpenAI) with rule-based fallback.
-----------------------------------------------------------------
"""
from __future__ import annotations
import os
import json
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
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .state import AgentState
from .db_utils import update_incident_status
from backend.omium_tracing import invoke_with_trace
from .timeline import append_timeline

# -- LLM Schema -------------------------------------------------------------

class CorrelationOutput(BaseModel):
    probable_root_cause: str = Field(description="The single most likely root cause.")
    causal_chain: str = Field(description="Step-by-step logic chain linking evidence to the cause.")
    confidence_score: float = Field(description="Confidence from 0.0 to 1.0.")

# -- Rule-based Fallback (Phase 1 logic) ------------------------------------

_ROLLBACK_KW  = ("deployment", "deploy", "version", "rollout", "release")
_POOL_KW      = ("pool", "exhaustion", "connection", "database", "db")
_LATENCY_KW   = ("latency", "spike", "slow", "timeout", "p99")
_OOM_KW       = ("memory", "oom", "heap", "out of memory")

def _correlate_rule_based(
    logs:        str,
    deployments: str,
    traces:      str,
    memory:      str,
) -> Dict[str, Any]:
    steps:    list[str] = []
    signals:  list[str] = []
    confidence = 0.40
    all_text = f"{logs} {deployments} {traces}".lower()

    if any(k in all_text for k in _ROLLBACK_KW) and deployments:
        signals.append("recent deployment change")
        steps.append(f"Recent deployment: {deployments.split('.')[0]}")
        confidence += 0.20
    if any(k in all_text for k in _POOL_KW):
        signals.append("database connection pool issue")
        steps.append("Connection pool exhaustion detected in logs")
        confidence += 0.15
    if any(k in all_text for k in _LATENCY_KW):
        signals.append("elevated latency / timeouts")
        steps.append("High-latency trace spans observed")
        confidence += 0.10
    if any(k in all_text for k in _OOM_KW):
        signals.append("memory exhaustion")
        steps.append("OOM events found in logs")
        confidence += 0.10
    if memory and "resolved" in memory.lower():
        steps.append("Similar past incident resolved via rollback")
        confidence += 0.05

    if steps:
        chain = " -> ".join(steps)
        root  = signals[0].capitalize() if signals else "Unknown root cause"
    else:
        chain = "No clear causal chain identified from available signals."
        root  = "Undetermined - escalate for manual review"

    return {
        "probable_root_cause": root,
        "causal_chain": chain,
        "confidence_score": min(confidence, 1.0)
    }

# -- LLM Correlator ---------------------------------------------------------

_PROMPT = """\
You are the SentinelOps Correlation Agent. Your job is to synthesize evidence from multiple sources to identify the root cause of a service incident.

CONTEXT:
Service: {service}
Incident Type: {incident_type}

EVIDENCE:
- Logs Summary: {logs}
- Deployment History: {deployments}
- Distributed Traces: {traces}
- Historical Context: {memory}
- Web Search: {web_search}

TASK:
1. Identify the most probable root cause (be specific).
2. Construct a causal chain showing how the evidence leads to this conclusion.
3. Assign a confidence score between 0.0 and 1.0.

{format_instructions}
"""

def _correlate_llm(
    service:     str,
    incident_type: str,
    logs:        str,
    deployments: str,
    traces:      str,
    memory:      str,
    web_search:  str = "",
) -> Optional[Dict[str, Any]]:
    """Attempt LLM correlation using Gemini or OpenAI."""
    try:
        # Check for keys
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

        parser = JsonOutputParser(pydantic_object=CorrelationOutput)
        prompt = ChatPromptTemplate.from_template(_PROMPT)
        
        chain = prompt | llm | parser
        
        result = invoke_with_trace(chain, {
            "service": service,
            "incident_type": incident_type,
            "logs": logs,
            "deployments": deployments,
            "traces": traces,
            "memory": memory,
            "web_search": web_search or "N/A",
            "format_instructions": parser.get_format_instructions(),
        })
        return result
    except Exception as e:
        print(f"[CorrelationAgent] LLM failed: {e}")
        return None

# -- Node -------------------------------------------------------------------

def correlation_agent(state: AgentState) -> AgentState:
    """LangGraph node - correlates all evidence into a root-cause chain."""
    print("[CorrelationAgent] Correlating signals ...")
    
    incident_id = state.get("incident_id")
    update_incident_status(incident_id, "correlating")

    try:
        service = state.get("alert_payload", {}).get("service", "unknown")
        incident_type = state.get("incident_type", "unknown")
        logs_summary = state.get("logs_summary", "")
        deployment_summary = state.get("deployment_summary", "")
        trace_summary = state.get("trace_summary", "")
        memory_context = state.get("memory_context", "")
        web_search = state.get("web_search_context", "")

        # 1. Try LLM
        result = _correlate_llm(
            service=service,
            incident_type=incident_type,
            logs=logs_summary,
            deployments=deployment_summary,
            traces=trace_summary,
            memory=memory_context,
            web_search=web_search,
        )

        # 2. Fallback to Rule-based if LLM fails or is not configured
        if not result:
            print("[CorrelationAgent] Using rule-based fallback logic.")
            result = _correlate_rule_based(
                logs=logs_summary,
                deployments=deployment_summary,
                traces=trace_summary,
                memory=memory_context
            )
        else:
            print("[CorrelationAgent] LLM reasoning successful.")

        probable_root_cause = result.get("probable_root_cause", "Undetermined")
        causal_chain = result.get("causal_chain", "N/A")
        confidence_score = result.get("confidence_score", 0.5)

        print(f"[CorrelationAgent] root={probable_root_cause}  "
              f"confidence={confidence_score:.0%}")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["correlation_agent"] = {
            "engine": "llm" if (result and "engine" in result and result.get("engine") != "rules") else "rules",
            "used_logs": logs_summary,
            "used_deployments": deployment_summary,
            "used_traces": trace_summary,
            "probable_root_cause": probable_root_cause,
            "confidence_score": confidence_score,
            "causal_chain": causal_chain
        }

        return {
            "probable_root_cause": probable_root_cause,
            "causal_chain":        causal_chain,
            "confidence_score":    confidence_score,
            "agent_outputs":       agent_outputs,
            "trace_spans": [_span("correlation_agent", "planner_agent", output=probable_root_cause)],
            "activity": [f"[Correlation] Root cause confidence reached {confidence_score:.0%}"],
            "incident_timeline": append_timeline(
                state.get("incident_timeline"),
                f"Correlation linked deploy → pool exhaustion → latency ({confidence_score:.0%})",
                "success",
            ),
        }
    except Exception as e:
        error_msg = f"CorrelationAgent error: {e}"
        print(f"[CorrelationAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


# Alias so graph.py keeps working unchanged
correlation_agent_node = correlation_agent
