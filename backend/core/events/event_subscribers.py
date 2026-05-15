import json
import logging
from backend.core.events.event_models import Event
from backend.core.events.event_types import EventType
from backend.core.events.event_bus import event_bus

logger = logging.getLogger("sentinelops.event_subscribers")
logger.setLevel(logging.INFO)

async def default_logger_handler(event: Event) -> None:
    """
    A generic subscriber that simply logs received events.
    Useful for global observability.
    """
    log_data = {
        "subscriber": "default_logger",
        "action": "received_event",
        "event_id": event.event_id,
        "event_type": event.event_type.value,
        "correlation_id": event.correlation_id,
        "payload_keys": list(event.payload.keys())
    }
    logger.info(json.dumps(log_data))

async def register_core_subscribers() -> None:
    """
    Register all core/default subscribers to the event bus.
    Call this during application startup.
    """
    for event_type in EventType:
        await event_bus.subscribe(event_type, default_logger_handler)
