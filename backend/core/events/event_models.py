import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

from backend.core.events.event_types import EventType, EventSeverity

class Event(BaseModel):
    """
    Standardized payload for all events published to the EventBus.
    Provides a consistent structure for logging and observability.
    """
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str
    task_id: Optional[str] = None
    agent_name: str
    event_type: EventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: Dict[str, Any] = Field(default_factory=dict)
    severity: EventSeverity = EventSeverity.INFO
