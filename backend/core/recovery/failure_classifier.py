import json
import traceback
import logging
from typing import Any, Dict, List
from backend.core.recovery.recovery_types import FailureCategory, SeverityLevel
from backend.core.recovery.failure_models import FailureClassification, RecoveryRecommendation

logger = logging.getLogger("sentinelops.recovery.failure_classifier")
logger.setLevel(logging.INFO)

class FailureClassifier:
    """
    Deterministic rule-based failure classification engine.
    Parses exceptions and execution context to produce actionable machine-readable recovery plans
    without relying on non-deterministic LLMs.
    """

    def __init__(self) -> None:
        # Maps exception keywords to deterministic resolutions:
        # (Category, Confidence, Severity, Recommendation Action)
        self.classification_rules = {
            "timeout": (FailureCategory.TIMEOUT, 0.9, SeverityLevel.HIGH, "RETRY"),
            "deadline exceeded": (FailureCategory.TIMEOUT, 0.9, SeverityLevel.HIGH, "RETRY"),
            "rate limit": (FailureCategory.LLM_FAILURE, 0.95, SeverityLevel.MEDIUM, "RETRY_WITH_BACKOFF"),
            "quota exceeded": (FailureCategory.LLM_FAILURE, 0.95, SeverityLevel.CRITICAL, "ESCALATE"),
            "model overload": (FailureCategory.LLM_FAILURE, 0.85, SeverityLevel.HIGH, "RETRY_WITH_BACKOFF"),
            "jsondecodeerror": (FailureCategory.INVALID_OUTPUT, 0.8, SeverityLevel.MEDIUM, "RETRY_WITH_NEW_PROMPT"),
            "validation error": (FailureCategory.INVALID_OUTPUT, 0.85, SeverityLevel.MEDIUM, "RETRY_WITH_NEW_PROMPT"),
            "connection refused": (FailureCategory.NETWORK_FAILURE, 0.9, SeverityLevel.CRITICAL, "ESCALATE"),
            "no route to host": (FailureCategory.NETWORK_FAILURE, 0.9, SeverityLevel.CRITICAL, "ESCALATE"),
            "operationalerror": (FailureCategory.DATABASE_FAILURE, 0.9, SeverityLevel.CRITICAL, "ESCALATE"),
            "integrityerror": (FailureCategory.DATABASE_FAILURE, 0.8, SeverityLevel.HIGH, "ESCALATE"),
            "import error": (FailureCategory.DEPENDENCY_FAILURE, 0.9, SeverityLevel.CRITICAL, "ESCALATE"),
            "modulenotfound": (FailureCategory.DEPENDENCY_FAILURE, 0.9, SeverityLevel.CRITICAL, "ESCALATE"),
            "tool execution failed": (FailureCategory.TOOL_FAILURE, 0.8, SeverityLevel.HIGH, "ALTERNATE_PATH")
        }

    def classify_failure(self, exception: Exception, context: Dict[str, Any] = None) -> FailureClassification:
        """
        Ingest a Python exception and runtime context, producing a structured
        classification and deterministic recovery recommendation.
        """
        context = context or {}
        exc_str = str(exception).lower()
        exc_type = type(exception).__name__.lower()
        
        # Parse the stack trace securely
        try:
            stack_trace = "".join(traceback.format_exception(type(exception), exception, exception.__traceback__))
        except Exception:
            stack_trace = str(exception)
        
        # Defaults
        category = FailureCategory.UNKNOWN
        confidence = 0.3
        severity = SeverityLevel.MEDIUM
        action_type = "ESCALATE"
        rationale = "No deterministic heuristic matched this failure signature."

        root_signals = self.extract_root_signals(exception)

        # Rule engine evaluation
        for keyword, (cat, conf, sev, action) in self.classification_rules.items():
            if keyword in exc_str or keyword in exc_type:
                category = cat
                confidence = conf
                severity = sev
                action_type = action
                rationale = f"Deterministic keyword match triggered: '{keyword}'"
                root_signals.append(f"Heuristic Match: {keyword}")
                break

        # Adjust confidence and actions based on execution context
        retry_count = context.get("retry_count", 0)
        if retry_count >= 3 and action_type in ("RETRY", "RETRY_WITH_BACKOFF"):
            action_type = "ESCALATE"
            rationale = "Maximum autonomous retry threshold exceeded; escalating to human operator."
            severity = SeverityLevel.CRITICAL

        summary = self.generate_failure_summary(category, exception)
        
        recommendation = RecoveryRecommendation(
            action_type=action_type,
            parameters={"retry_delay_sec": 5 if "BACKOFF" in action_type else 0},
            rationale=rationale
        )

        classification = FailureClassification(
            category=category,
            confidence=confidence,
            severity=severity,
            root_signals=root_signals,
            stack_trace_snippet=stack_trace[:1500],  # Bound length
            summary=summary,
            recommendations=[recommendation]
        )

        # Structured machine-readable logging
        logger.info(json.dumps({
            "action": "classify_failure",
            "classification_id": classification.classification_id,
            "category": category.value,
            "severity": severity.value,
            "confidence": confidence,
            "recommended_action": action_type,
            "exception_type": exc_type
        }))

        return classification

    def extract_root_signals(self, exception: Exception) -> List[str]:
        """Extract purely deterministic trace signals from the exception footprint."""
        signals = []
        exc_type = type(exception).__name__
        signals.append(f"ExceptionClass: {exc_type}")
        
        exc_str = str(exception)
        if len(exc_str) > 0:
            signals.append(f"MessageFootprintLen: {len(exc_str)}")
        
        # Analyze stack trace depth if available
        if exception.__traceback__:
            tb_len = len(traceback.extract_tb(exception.__traceback__))
            signals.append(f"StackDepth: {tb_len}")

        return signals

    def generate_failure_summary(self, category: FailureCategory, exception: Exception) -> str:
        """Create an explainable summary of the deterministic classification."""
        return f"[{category.value}] Engine encountered {type(exception).__name__}: {str(exception)[:200]}"
