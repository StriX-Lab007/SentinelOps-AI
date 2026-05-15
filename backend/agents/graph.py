from typing import List
from langgraph.graph import END, StateGraph

from .state import AgentState

from .planner_agent import planner_agent
from .log_agent import log_agent
from .deploy_agent import deploy_agent
from .trace_agent import trace_agent
from .correlation_agent import correlation_agent
from .memory_agent import memory_agent
from .remediation_agent import remediation_agent
from .reporter_agent import reporter_agent
from .github_agent import github_issue_agent
from .slack_agent import slack_notification_agent

try:
    from backend.omium_tracing import trace_agent as omium_trace_agent
except ImportError:
    def omium_trace_agent(name: str):
        def _id(fn):
            return fn
        return _id

_AGENTS = {
    "planner": planner_agent,
    "log_agent": log_agent,
    "trace_agent": trace_agent,
    "deploy_agent": deploy_agent,
    "memory_agent": memory_agent,
    "correlator": correlation_agent,
    "remediator": remediation_agent,
    "github_issue": github_issue_agent,
    "slack_notification": slack_notification_agent,
    "reporter": reporter_agent,
}

workflow = StateGraph(AgentState)

for _name, _fn in _AGENTS.items():
    workflow.add_node(_name, omium_trace_agent(_name)(_fn))

workflow.set_entry_point("planner")


def route_from_planner(state: AgentState) -> List[str]:
    return ["log_agent", "trace_agent", "deploy_agent", "memory_agent"]


workflow.add_conditional_edges(
    "planner",
    route_from_planner,
    ["log_agent", "trace_agent", "deploy_agent", "memory_agent"],
)

workflow.add_edge("log_agent", "correlator")
workflow.add_edge("trace_agent", "correlator")
workflow.add_edge("deploy_agent", "correlator")
workflow.add_edge("memory_agent", "correlator")

workflow.add_edge("correlator", "remediator")
workflow.add_edge("remediator", "github_issue")
workflow.add_edge("github_issue", "slack_notification")
workflow.add_edge("slack_notification", "reporter")
workflow.add_edge("reporter", END)

app_graph = workflow.compile()


def run_investigation(incident_id: str, alert_payload: dict) -> dict:
    initial_state: AgentState = {
        "incident_id": incident_id,
        "alert_payload": alert_payload,
        "agent_outputs": {},
        "errors": [],
        "trace_spans": [],
        "activity": [],
        "tasks": [],
        "incident_timeline": [],
    }
    return app_graph.invoke(initial_state)
