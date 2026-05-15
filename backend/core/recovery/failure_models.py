import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from backend.core.recovery.recovery_types import FailureCategory, SeverityLevel

class RecoveryRecommendation(BaseModel):
    """Machine-readable instruction for the recovery agent."""
    action_type: str = Field(description="Action directive, e.g., RETRY, ESCALATE, RETRY_WITH_BACKOFF, ALTERNATE_PATH")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Metadata required to execute the action safely")
    rationale: str = Field(description="Explainable deterministic reasoning for why this action was chosen")

class FailureClassification(BaseModel):
    """Standardized deterministic output of the failure classifier."""
    classification_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    category: FailureCategory
    confidence: float = Field(ge=0.0, le=1.0, description="Rule-based confidence score")
    severity: SeverityLevel
    root_signals: List[str] = Field(default_factory=list, description="Extracted signatures from the exception footprint")
    stack_trace_snippet: Optional[str] = Field(None, description="Truncated stack trace for observability")
    summary: str = Field(description="Human-readable synthesis of the failure")
    recommendations: List[RecoveryRecommendation] = Field(default_factory=list)
