"""
agents/trace_agent.py
-----------------------------------------------------------------
Trace Agent - fetches distributed trace spans and surfaces
dependency impact or high latency propagation.

Includes a simulated timeout + Omium checkpoint replay on first run.
-----------------------------------------------------------------
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from datetime import datetime, timezone

from backend.tools.trace_tools import fetch_trace_spans, summarise_traces
from backend.omium_tracing import save_checkpoint, checkpoint_replay_url, is_enabled, get_current_execution_id
from .state import AgentState
from .db_utils import update_incident_status
from .specialist_llm import analyze_traces
from .tasks import update_task_status
from .timeline import append_timeline

_TRACE_RETRY_ONCE: set[str] = set()


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


def _build_dependency_chain(service: str, spans: list[dict[str, Any]]) -> list[str]:
    if not spans:
        return [service]

    chain = ["api-gateway", service]
    for span in spans:
        if span.get("status") in ("error", "timeout"):
            op = span.get("operation", "unknown-op")
            if "db" in op.lower():
                chain.append(f"database-cluster ({op})")
            elif "http" in op.lower():
                chain.append(f"downstream-service ({op})")

    seen: set[str] = set()
    result: list[str] = []
    for item in chain:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _fetch_with_checkpoint_retry(
    state: AgentState,
    service: str,
    incident_id: str,
) -> tuple[list[dict[str, Any]], str, list[str], list[Dict[str, Any]], list[Dict[str, Any]], list[Dict[str, Any]]]:
    """
    First attempt fails (demo); checkpoint saved; replay succeeds.
    Returns spans, summary, activity lines, extra trace spans, checkpoint events.
    """
    activity: list[str] = []
    trace_spans_extra: list[Dict[str, Any]] = []
    checkpoint_events: list[Dict[str, Any]] = []
    execution_id = incident_id or get_current_execution_id() or ""

    if incident_id and incident_id not in _TRACE_RETRY_ONCE:
        _TRACE_RETRY_ONCE.add(incident_id)

        pre_state = {
            "incident_id": incident_id,
            "service": service,
            "phase": "span_fetch_timeout",
            "attempt": 1,
        }
        ckpt_name = "trace_agent.pre_retry"
        save_checkpoint(ckpt_name, pre_state, agent_id="trace_agent")

        replay_url = checkpoint_replay_url(execution_id, ckpt_name) if execution_id else None
        checkpoint_events.append({
            "name": ckpt_name,
            "agent": "trace_agent",
            "action": "saved",
            "replay_url": replay_url,
            "omium_enabled": is_enabled(),
        })

        activity.append("[Trace Agent] Span fetch timed out — initiating self-healing recovery")
        trace_spans_extra.append(
            _span("trace_agent_attempt_1", "planner_agent", status="failed", output="span_fetch_timeout")
        )

        time.sleep(0.25)

        replay_ckpt = "trace_agent.replay"
        save_checkpoint(replay_ckpt, {
            "replay_from": ckpt_name,
            "incident_id": incident_id,
            "service": service,
            "attempt": 2,
        }, agent_id="trace_agent")

        checkpoint_events.append({
            "name": replay_ckpt,
            "agent": "trace_agent",
            "action": "replay",
            "replay_from": ckpt_name,
            "replay_url": checkpoint_replay_url(execution_id, replay_ckpt) if execution_id else None,
            "omium_enabled": is_enabled(),
        })

        # Inject simulated snapshot events for the new Runtime Memory Panel
        snapshots = [
            {"agent": "trace_agent", "status": "failed", "message": "Trace Agent failed (timeout)"},
            {"agent": "logging_agent", "status": "stored", "message": "Logging Agent detected failure"},
            {"agent": "recovery_agent", "status": "replayed", "message": "Recovery workflow initiated"},
            {"agent": "recovery_agent", "status": "recovered", "message": "Checkpoint replay successful"}
        ]

        activity.append("[Trace Agent] ♻️ Replay successful — recovering traces from checkpoint")
        trace_spans_extra.append(
            _span("trace_agent_replay", "planner_agent", status="running", output="checkpoint replay")
        )
        time.sleep(0.45)
        
        spans = fetch_trace_spans(service, limit=100)
        trace_summary = summarise_traces(spans, service)
        return spans, trace_summary, activity, trace_spans_extra, checkpoint_events, snapshots

    spans = fetch_trace_spans(service, limit=100)
    trace_summary = summarise_traces(spans, service)
    return spans, trace_summary, activity, trace_spans_extra, checkpoint_events, []


def trace_agent(state: AgentState) -> AgentState:
    """LangGraph node - fetches and summarises distributed traces."""
    print("[TraceAgent] Fetching distributed traces...")

    incident_id = state.get("incident_id")
    if incident_id is not None:
        update_incident_status(incident_id, "investigating")
    else:
        incident_id = ""

    try:
        payload = state.get("alert_payload") or {}
        service = payload.get("service", "unknown")
        
        # Determine simulation toggle
        simulate = "trace_timeout" in state.get("simulate_failures", "")
        retries = state.get("trace_agent_retries", 0)
        
        if simulate and retries == 0:
            raise TimeoutError("Deadline exceeded: Trace API failed to respond in time.")

        try:
            spans = fetch_trace_spans(service, limit=100)
            trace_summary = summarise_traces(spans, service)
            activity = []
            trace_spans_extra = []
            checkpoint_events = []
            snapshots = []
        except Exception as exc:
            error_msg = f"TraceAgent error: {exc}"
            print(f"[TraceAgent] {error_msg}")
            update_incident_status(incident_id, "failed")
            return {
                "trace_spans": [],
                "trace_summary": "Trace fetch failed.",
                "errors": [error_msg],
            }

        dependency_chain = _build_dependency_chain(service, spans)

        llm_summary = analyze_traces(service, spans, trace_summary)
        if llm_summary:
            trace_summary = llm_summary
        elif len(dependency_chain) > 2:
            trace_summary += f" Dependency impact: {' -> '.join(dependency_chain)}."

        if checkpoint_events:
            save_checkpoint("trace_agent.post_retry", {
                "incident_id": incident_id,
                "service": service,
                "span_count": len(spans),
                "summary": trace_summary[:200],
            }, agent_id="trace_agent")

        time.sleep(0.35)
        print(f"[TraceAgent] {trace_summary}")

        agent_outputs = dict(state.get("agent_outputs") or {})
        agent_outputs["trace_agent"] = {
            "service": service,
            "span_count": len(spans),
            "dependency_chain": dependency_chain,
            "summary": trace_summary,
            "engine": "llm" if llm_summary else "rules",
            "retried": bool(activity),
            "checkpoint_events": checkpoint_events,
        }

        tasks = update_task_status(
            state.get("tasks") or [],
            "trace_agent",
            "retried" if activity else "completed",
            trace_summary[:120],
        )

        out_activity = activity + ["[Trace Agent] Dependency bottleneck identified"]
        return {
            "trace_spans": spans + trace_spans_extra + [
                _span("trace_agent", "planner_agent", output=trace_summary)
            ],
            "trace_summary": trace_summary,
            "checkpoint_events": checkpoint_events,
            "snapshots": snapshots,
            "agent_outputs": agent_outputs,
            "activity": out_activity,
            "incident_timeline": append_timeline(
                state.get("incident_timeline"),
                "Trace Agent reconstructed DB pool bottleneck (after checkpoint replay)",
                "warn",
            ),
        }
    except Exception as e:
        error_msg = f"TraceAgent unhandled error: {e}"
        print(f"[TraceAgent] {error_msg}")
        update_incident_status(incident_id, "failed")
        return {"errors": [error_msg]}


trace_agent_node = trace_agent
