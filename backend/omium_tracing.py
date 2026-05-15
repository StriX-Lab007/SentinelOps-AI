"""
Omium SDK integration for SentinelOps AI.

- Initializes Omium at process start (when OMIUM_API_KEY is set)
- Correlates traces with incident_id via set_execution_id()
- LangGraph ainvoke/astream auto-instrumentation
- Per-agent and per-tool spans for verifiable hierarchy
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable, Iterator, List, Optional, TypeVar

logger = logging.getLogger("sentinelops.omium")

_OMIUM = None
_INITIALIZED = False

F = TypeVar("F", bound=Callable[..., Any])


def _import_omium():
    global _OMIUM
    if _OMIUM is not None:
        return _OMIUM
    try:
        import omium
        _OMIUM = omium
    except ImportError:
        _OMIUM = False
    return _OMIUM


def setup_omium() -> bool:
    """Call once at FastAPI startup. Returns True when tracing is active."""
    global _INITIALIZED
    omium = _import_omium()
    if omium is False:
        logger.info("Omium package not installed — tracing disabled")
        return False

    api_key = os.getenv("OMIUM_API_KEY")
    if not api_key:
        logger.info("OMIUM_API_KEY not set — tracing disabled (dry-run only)")
        return False

    project = os.getenv("OMIUM_PROJECT", "sentinelops-ai")
    omium.init(
        api_key=api_key,
        project=project,
        auto_trace=True,
        auto_checkpoint=True,
        checkpoint_strategy=os.getenv("OMIUM_CHECKPOINT_STRATEGY", "node"),
        api_base_url=os.getenv("OMIUM_API_URL"),
        debug=os.getenv("OMIUM_DEBUG", "").lower() in ("1", "true", "yes"),
    )
    omium.instrument_langgraph()
    _INITIALIZED = True
    logger.info("Omium initialized for project=%s", project)
    return True


def is_enabled() -> bool:
    return _INITIALIZED and _import_omium() not in (None, False)


def get_project() -> str:
    return os.getenv("OMIUM_PROJECT", "sentinelops-ai")


def dashboard_url(execution_id: str) -> str:
    """Deep link judges can open to verify the run on Omium."""
    base = os.getenv("OMIUM_APP_URL", "https://app.omium.ai").rstrip("/")
    project = get_project()
    return f"{base}/projects/{project}/executions/{execution_id}"


def get_current_execution_id() -> Optional[str]:
    omium = _import_omium()
    if not omium or not _INITIALIZED:
        return None
    return omium.get_execution_id()


@contextmanager
def omium_execution(execution_id: str):
    """Bind incident/workflow ID to all spans in this investigation."""
    omium = _import_omium()
    if omium and _INITIALIZED:
        omium.set_execution_id(execution_id)
    try:
        yield execution_id
    finally:
        pass


def trace_meta(name: str, span_type: str = "function") -> Callable[[F], F]:
    """Decorator that no-ops when Omium is unavailable."""
    def decorator(fn: F) -> F:
        omium = _import_omium()
        if omium and _INITIALIZED:
            return omium.trace(name, span_type=span_type)(fn)
        return fn
    return decorator


def trace_agent(node_name: str) -> Callable[[F], F]:
    return trace_meta(f"agent.{node_name}", span_type="agent")


def trace_tool(tool_name: str) -> Callable[[F], F]:
    return trace_meta(f"tool.{tool_name}", span_type="tool")


def trace_webhook(name: str = "webhook.alert") -> Callable[[F], F]:
    return trace_meta(name, span_type="webhook")


def langchain_callbacks() -> List[Any]:
    omium = _import_omium()
    if not omium or not _INITIALIZED:
        return []
    try:
        return [omium.OmiumCallbackHandler()]
    except Exception as e:
        logger.warning("OmiumCallbackHandler unavailable: %s", e)
        return []


def invoke_with_trace(chain: Any, inputs: dict) -> Any:
    """Run a LangChain chain with Omium LLM spans when configured."""
    callbacks = langchain_callbacks()
    if callbacks:
        return chain.invoke(inputs, config={"callbacks": callbacks})
    return chain.invoke(inputs)


def omium_status() -> dict:
    return {
        "enabled": is_enabled(),
        "project": get_project(),
        "app_url": os.getenv("OMIUM_APP_URL", "https://app.omium.ai"),
    }


def wrap_graph_nodes(node_map: dict[str, Callable]) -> dict[str, Callable]:
    """Apply agent-level spans to LangGraph nodes."""
    wrapped = {}
    for name, fn in node_map.items():
        wrapped[name] = trace_agent(name)(fn)
    return wrapped


def save_checkpoint(name: str, state: dict, agent_id: str = "orchestrator") -> Optional[str]:
    """
    Persist an Omium checkpoint (span event + trace metadata).
    Returns checkpoint name when recorded, else None.
    """
    if not is_enabled():
        logger.info("[checkpoint dry-run] %s agent=%s", name, agent_id)
        return None
    try:
        from omium.integrations.decorators import _create_checkpoint_sync
        from omium.integrations.core import get_current_config

        config = get_current_config()
        if config:
            payload = {**state, "agent_id": agent_id}
            _create_checkpoint_sync(name, payload, config)
            return name
    except Exception as e:
        logger.warning("Checkpoint save failed for %s: %s", name, e)
    return None


def checkpoint_replay_url(execution_id: str, checkpoint_name: str) -> str:
    """Deep link to a checkpoint replay view on Omium."""
    base = dashboard_url(execution_id)
    return f"{base}?checkpoint={checkpoint_name}"
