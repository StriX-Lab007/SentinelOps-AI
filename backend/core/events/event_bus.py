import asyncio
import json
import logging
from typing import Callable, Coroutine, Dict, List, Any

from backend.core.events.event_models import Event
from backend.core.events.event_types import EventType

logger = logging.getLogger("sentinelops.event_bus")
logger.setLevel(logging.INFO)

class EventBus:
    """
    Centralized internal async event bus for decoupled component communication.
    Supports concurrent subscribers, retry logic, and structured JSON logging.
    """
    def __init__(self) -> None:
        self._subscribers: Dict[EventType, List[Callable[[Event], Coroutine[Any, Any, None]]]] = {
            event_type: [] for event_type in EventType
        }
        self._lock = asyncio.Lock()

    async def subscribe(self, event_type: EventType, handler: Callable[[Event], Coroutine[Any, Any, None]]) -> None:
        """Register an async handler function for a specific event type."""
        async with self._lock:
            if handler not in self._subscribers[event_type]:
                self._subscribers[event_type].append(handler)

    async def unsubscribe(self, event_type: EventType, handler: Callable[[Event], Coroutine[Any, Any, None]]) -> None:
        """Remove a registered async handler function."""
        async with self._lock:
            if handler in self._subscribers[event_type]:
                self._subscribers[event_type].remove(handler)

    async def publish(self, event: Event) -> None:
        """Publish an event to all registered subscribers concurrently."""
        # Structured JSON logging
        log_payload = {
            "bus_action": "publish",
            "event_id": event.event_id,
            "correlation_id": event.correlation_id,
            "task_id": event.task_id,
            "agent_name": event.agent_name,
            "event_type": event.event_type.value,
            "severity": event.severity.value,
            "timestamp": event.timestamp.isoformat(),
        }
        logger.info(json.dumps(log_payload))

        async with self._lock:
            handlers = list(self._subscribers[event.event_type])

        if not handlers:
            return

        # Execute handlers concurrently
        tasks = []
        for handler in handlers:
            tasks.append(asyncio.create_task(self._safe_execute(handler, event)))

        # Do not block the caller to wait for all handlers; but gather them to prevent task leakage.
        # Fire-and-forget is suitable here, we wait for all handlers to prevent losing track.
        # Since it's an async event bus, callers await publish. 
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _safe_execute(
        self, 
        handler: Callable[[Event], Coroutine[Any, Any, None]], 
        event: Event, 
        max_retries: int = 3
    ) -> None:
        """Execute a handler with exponential backoff retry logic."""
        retries = 0
        base_delay = 0.5
        while retries <= max_retries:
            try:
                await handler(event)
                return
            except Exception as e:
                retries += 1
                if retries > max_retries:
                    error_payload = {
                        "bus_action": "handler_failed",
                        "error": "Handler failed after max retries",
                        "event_id": event.event_id,
                        "handler": handler.__name__,
                        "exception": str(e)
                    }
                    logger.error(json.dumps(error_payload))
                else:
                    await asyncio.sleep(base_delay * (2 ** (retries - 1)))

# Global singleton event bus instance
event_bus = EventBus()

def sync_publish(event: Event) -> None:
    """Helper to publish events from synchronous code (e.g. LangGraph nodes)."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(event_bus.publish(event))
    except RuntimeError:
        # No running loop, use asyncio.run (e.g. background threads)
        asyncio.run(event_bus.publish(event))
