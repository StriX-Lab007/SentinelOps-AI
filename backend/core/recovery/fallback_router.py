import logging
from typing import Any, Dict

logger = logging.getLogger("sentinelops.recovery.fallback_router")

class FallbackRouter:
    """
    Determines fallback mechanisms, such as switching LLM providers or skipping optional dependencies.
    """
    
    @staticmethod
    def apply_fallback(action_type: str, context: Dict[str, Any]) -> None:
        """Mutate the context state to enable a degraded or alternate execution path."""
        logger.info(f"[FallbackRouter] Applying fallback strategy: {action_type}")
        
        if action_type == "RETRY_WITH_FALLBACK_PROVIDER":
            logger.info("Switching to secondary LLM provider.")
            context["llm_provider"] = "fallback_model"
            
        elif action_type == "CONTINUE_DEGRADED":
            logger.info("Skipping optional dependencies, continuing in degraded mode.")
            context["degraded_mode"] = True
            
        elif action_type == "ALTERNATE_PATH":
            logger.info("Activating alternate static rule execution path.")
            context["force_rule_based"] = True
