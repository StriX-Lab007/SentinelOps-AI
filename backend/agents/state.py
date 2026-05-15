"""
agents/state.py
-----------------------------------------------------------------------------
Shared LangGraph state for the SentinelOps AI multi-agent pipeline.

Every agent reads from this TypedDict and returns a *partial* dict that
LangGraph merges back into the running state.  All fields are Optional so
that upstream agents never block downstream ones when data is unavailable.

Field groups
------------
  Core          - incident identity and the raw webhook payload
  Planner       - incident classification and the ordered execution plan
  Specialists   - per-domain evidence summaries (logs, deploys, traces)
  Synthesis     - root-cause analysis and confidence produced by correlation
  Memory        - similar past incidents retrieved from the memory store
  Remediation   - ranked candidates and the chosen action with steps
  Reporting     - final Markdown report, Slack message, GitHub issue body
  Meta          - per-agent raw outputs (for UI/debug) and error log
-----------------------------------------------------------------------------
"""
from __future__ import annotations

from operator import add, ior
from typing import Annotated, Any, Dict, List, Optional
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):

    # -- Core --------------------------------------------------------------
    incident_id: str
    """Unique ID of the Incident row in the database."""

    alert_payload: Dict[str, Any]
    """Raw webhook payload as received (service, severity, message, ...)."""

    # -- Planner outputs ---------------------------------------------------
    incident_type: str
    """Classified incident category, e.g. 'latency_spike', 'deploy_regression',
    'oom_crash', 'config_drift', 'dependency_failure'."""

    priority: str
    """Execution priority: 'critical' | 'high' | 'medium' | 'low'."""

    plan: List[str]
    """Ordered list of agent node names the graph should execute,
    e.g. ['log_agent', 'deploy_agent', 'trace_agent', 'correlation_agent',
          'memory_agent', 'remediation_agent', 'reporter_agent']."""

    tasks: List[Dict[str, Any]]
    """Explicit InvestigationTask dicts for orchestration UI and Omium."""

    incident_timeline: Annotated[List[Dict[str, Any]], add]
    """Causal timeline events: {time, event, type} for frontend reconstruction."""

    web_search_context: str
    """Live web search snippets used during correlation."""

    checkpoint_events: Annotated[List[Dict[str, Any]], add]
    """Omium checkpoint markers for replay demos, e.g. trace_agent retry."""

    # -- Specialist agent outputs -------------------------------------------
    logs_summary: str
    """Human-readable summary of relevant log findings for the service."""

    raw_logs: List[Dict[str, Any]]
    """Raw log records fetched from the DB / log backend."""

    deployment_summary: str
    """Human-readable summary of recent deployments and suspicious changes."""

    recent_deployments: List[Dict[str, Any]]
    """Raw deployment records within the investigation window."""

    trace_summary: str
    """Human-readable summary of distributed trace findings."""

    trace_spans: Annotated[List[Dict[str, Any]], add]
    """Raw trace span records from the tracing backend."""

    activity: Annotated[List[str], add]
    """Activity strings for the UI live event stream."""

    # -- Synthesis outputs (Correlation Agent) -----------------------------
    probable_root_cause: str
    """Single-sentence root-cause hypothesis, e.g.
    'Deployment v2.14.0 introduced a DB pool size regression.'"""

    causal_chain: str
    """Step-by-step narrative linking evidence to the root cause, e.g.
    'deploy v2.14.0 -> pool exhaustion -> query timeouts -> P99 latency spike'."""

    confidence_score: float
    """0.0 - 1.0 confidence that the causal chain is correct."""

    # -- Memory outputs ----------------------------------------------------
    historical_matches: List[Dict[str, Any]]
    """Past resolved incidents that closely match the current one.
    Each item has: id, title, severity, summary, created_at."""

    memory_context: str
    """Formatted text summary of historical matches for use in prompts."""

    # -- Remediation outputs -----------------------------------------------
    remediation_candidates: List[Dict[str, Any]]
    """Ranked list of candidate actions.
    Each item has: action (str), rationale (str), risk (str), confidence (float)."""

    remediation_action: str
    """The chosen remediation action title, e.g. 'Rollback billing-service to v2.13.9'."""

    remediation_steps: List[str]
    """Ordered step-by-step instructions to execute the chosen remediation."""

    rollback_target: Optional[str]
    """Target version/commit for rollback actions; None when not applicable."""

    requires_approval: bool
    """True if remediation confidence is low and human approval is required."""

    # -- Reporting outputs -------------------------------------------------
    report_markdown: str
    """Full structured incident report in Markdown, written to Incident.summary."""

    slack_message: str
    """Short Slack-formatted notification string (max ~400 chars)."""

    github_issue_payload: Dict[str, Any]
    """Payload for creating a GitHub issue:
    {'title': str, 'body': str, 'labels': List[str]}."""

    report_sent: bool
    """True once the report has been dispatched (Slack / GitHub / email)."""

    # -- Meta / UI visibility ----------------------------------------------
    agent_outputs: Annotated[Dict[str, Any], ior]
    """Keyed raw outputs from each agent node, e.g.
    {'planner': {...}, 'log_agent': {...}, ...}.
    Consumed by the frontend dashboard to render per-agent panels."""

    snapshots: Annotated[List[Dict[str, Any]], add]
    """List of snapshot events generated during this execution."""

    errors: Annotated[List[str], add]
    """Accumulated non-fatal error messages from any agent node.
    The pipeline continues even when errors are present."""
    
    simulate_failures: str
    """Comma-separated list of failure simulation toggles."""
