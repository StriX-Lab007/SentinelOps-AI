import logging
import json
import time
from typing import Callable, Dict, Any
from backend.core.events import Event, EventType, EventSeverity
from backend.core.events.event_bus import sync_publish
from backend.core.recovery.failure_classifier import FailureClassifier
from backend.core.recovery.retry_engine import RetryEngine
from backend.core.recovery.fallback_router import FallbackRouter

logger = logging.getLogger("sentinelops.recovery.orchestrator")

class RecoveryOrchestrator:
    """
    Consumes failures, maps them to deterministic recovery strategies,
    executes retries/fallbacks, and logs an audit trail.
    """
    
    def __init__(self) -> None:
        self.classifier = FailureClassifier()

    def attempt_recovery(
        self, 
        exception: Exception, 
        agent_name: str, 
        state: Dict[str, Any], 
        fn_to_run: Callable[[Dict[str, Any]], Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Evaluate an exception and attempt to self-heal the workflow.
        Returns the healed state or re-raises the exception if unrecoverable.
        """
        incident_id = state.get("incident_id", "UNKNOWN")
        retry_key = f"{agent_name}_retries"
        current_retries = state.get(retry_key, 0)
        
        # 1. Classify the Failure
        context = {"retry_count": current_retries}
        classification = self.classifier.classify_failure(exception, context)
        rec = classification.recommendations[0] if classification.recommendations else None
        action_type = rec.action_type if rec else "ESCALATE"
        confidence = classification.confidence
        
        # Confidence-based escalation logic
        if confidence < 0.5 and action_type != "ESCALATE":
            logger.warning("[RecoveryOrchestrator] Low confidence recovery strategy. Escalating to human.")
            action_type = "ESCALATE"
            
        # 2. Emit RECOVERY_TRIGGERED event
        sync_publish(Event(
            correlation_id=incident_id,
            agent_name=agent_name,
            event_type=EventType.RECOVERY_TRIGGERED,
            payload={
                "strategy": action_type,
                "confidence": confidence,
                "category": classification.category.value,
                "rationale": rec.rationale if rec else "Unknown",
                "audit_trail": f"Classified as {classification.category.value}. Confidence {confidence}."
            }
        ))
        
        logger.info(json.dumps({
            "action": "recovery_initiated",
            "agent": agent_name,
            "strategy": action_type
        }))

        try:
            # 3. Execute Recovery Strategy
            result_state = None
            
            if action_type == "ESCALATE":
                sync_publish(Event(
                    correlation_id=incident_id,
                    agent_name=agent_name,
                    event_type=EventType.HUMAN_INTERVENTION_REQUIRED,
                    severity=EventSeverity.CRITICAL,
                    payload={"reason": classification.summary}
                ))
                raise exception
                
            elif action_type in ("RETRY", "RETRY_WITH_BACKOFF", "RETRY_WITH_NEW_PROMPT"):
                # RETRY_WITH_NEW_PROMPT is treated as a plain retry at the orchestration
                # level (the prompt context is implicit in a re-call of the same function).
                delay = rec.parameters.get("retry_delay_sec", 1.0) if rec else 1.0
                time.sleep(delay)
                state[retry_key] = current_retries + 1
                result_state = RetryEngine.execute_with_retry(fn_to_run, max_retries=1, base_delay=0.5, state=state)
                
            elif action_type in ("RETRY_WITH_FALLBACK_PROVIDER", "ALTERNATE_PATH", "CONTINUE_DEGRADED"):
                FallbackRouter.apply_fallback(action_type, state)
                state[retry_key] = current_retries + 1
                result_state = fn_to_run(state)
                
            else:
                # Unknown strategy
                raise exception

            # Guard: if result_state is None the agent function returned None —
            # treat this as an unrecoverable failure rather than passing None upstream.
            if result_state is None:
                logger.error(f"[RecoveryOrchestrator] Agent {agent_name} returned None after {action_type}. Treating as unrecoverable.")
                raise exception

            # 4. Emit RECOVERY_SUCCESS event
            sync_publish(Event(
                correlation_id=incident_id,
                agent_name=agent_name,
                event_type=EventType.RECOVERY_SUCCESS,
                payload={
                    "strategy": action_type,
                    "audit_trail": f"Successfully executed {action_type} for {agent_name}."
                }
            ))
            
            logger.info(f"[RecoveryOrchestrator] Successfully recovered {agent_name} via {action_type}.")
            return result_state

        except Exception as final_exc:
            # 5. Emit RECOVERY_FAILED event
            sync_publish(Event(
                correlation_id=incident_id,
                agent_name=agent_name,
                event_type=EventType.RECOVERY_FAILED,
                severity=EventSeverity.ERROR,
                payload={
                    "strategy": action_type,
                    "error": str(final_exc),
                    "audit_trail": f"Recovery via {action_type} failed."
                }
            ))
            logger.error(f"[RecoveryOrchestrator] Recovery failed for {agent_name}: {final_exc}")
            raise final_exc

# Global instance
recovery_orchestrator = RecoveryOrchestrator()
