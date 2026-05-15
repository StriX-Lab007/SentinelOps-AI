"""WebSocket event types and emission helpers for structured real-time communication."""

from typing import TypedDict, Literal, Union, Optional, Any
from datetime import datetime, timezone
import json


class BaseEvent(TypedDict):
    """Base structure for all WebSocket events."""
    type: str
    timestamp: str


class AgentStartedEvent(TypedDict):
    """Agent workflow started."""
    type: Literal["agent_started"]
    agent: str
    timestamp: str


class AgentCompletedEvent(TypedDict):
    """Agent workflow completed."""
    type: Literal["agent_completed"]
    agent: str
    summary: str
    timestamp: str


class ActivityEvent(TypedDict):
    """General activity/progress message."""
    type: Literal["activity"]
    message: str
    severity: Literal["info", "warn", "error", "success"]
    timestamp: str


class ConfidenceUpdateEvent(TypedDict):
    """Confidence score update."""
    type: Literal["confidence_update"]
    value: float
    timestamp: str


class TimelineEventType(TypedDict):
    """Operational timeline event."""
    type: Literal["timeline_event"]
    title: str
    time: str
    timestamp: str


class IntegrationEvent(TypedDict):
    """Integration/side-effect event (GitHub, Slack, etc.)."""
    type: Literal["integration"]
    service: str
    status: Literal["pending", "in_progress", "completed", "failed"]
    message: str
    timestamp: str


class RootCauseUpdateEvent(TypedDict):
    """Root cause analysis update."""
    type: Literal["root_cause_update"]
    rootCause: str
    confidence: float
    timestamp: str


class RemediationUpdateEvent(TypedDict):
    """Remediation action update."""
    type: Literal["remediation_update"]
    action: str
    timestamp: str


# Discriminated union of all event types
WebSocketEvent = Union[
    AgentStartedEvent,
    AgentCompletedEvent,
    ActivityEvent,
    ConfidenceUpdateEvent,
    TimelineEventType,
    IntegrationEvent,
    RootCauseUpdateEvent,
    RemediationUpdateEvent,
]


def get_iso_timestamp() -> str:
    """Get current timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def emit_agent_started(agent: str) -> AgentStartedEvent:
    """Emit agent workflow started event."""
    return {
        "type": "agent_started",
        "agent": agent,
        "timestamp": get_iso_timestamp(),
    }


def emit_agent_completed(agent: str, summary: str) -> AgentCompletedEvent:
    """Emit agent workflow completed event."""
    return {
        "type": "agent_completed",
        "agent": agent,
        "summary": summary,
        "timestamp": get_iso_timestamp(),
    }


def emit_activity(message: str, severity: str = "info") -> ActivityEvent:
    """Emit activity/progress message event."""
    return {
        "type": "activity",
        "message": message,
        "severity": severity,  # type: ignore
        "timestamp": get_iso_timestamp(),
    }


def emit_confidence_update(value: float) -> ConfidenceUpdateEvent:
    """Emit confidence score update event."""
    return {
        "type": "confidence_update",
        "value": max(0.0, min(1.0, value)),
        "timestamp": get_iso_timestamp(),
    }


def emit_timeline_event(title: str, time: str) -> TimelineEventType:
    """Emit operational timeline event."""
    return {
        "type": "timeline_event",
        "title": title,
        "time": time,
        "timestamp": get_iso_timestamp(),
    }


def emit_integration(service: str, status: str, message: str) -> IntegrationEvent:
    """Emit integration/side-effect event."""
    return {
        "type": "integration",
        "service": service,
        "status": status,  # type: ignore
        "message": message,
        "timestamp": get_iso_timestamp(),
    }


def emit_root_cause_update(root_cause: str, confidence: float) -> RootCauseUpdateEvent:
    """Emit root cause update event."""
    return {
        "type": "root_cause_update",
        "rootCause": root_cause,
        "confidence": max(0.0, min(1.0, confidence)),
        "timestamp": get_iso_timestamp(),
    }


def emit_remediation_update(action: str) -> RemediationUpdateEvent:
    """Emit remediation action update event."""
    return {
        "type": "remediation_update",
        "action": action,
        "timestamp": get_iso_timestamp(),
    }


def event_to_json(event: WebSocketEvent) -> str:
    """Convert event to JSON string for WebSocket transmission."""
    return json.dumps(event)
