from enum import Enum

class FailureCategory(str, Enum):
    """Categorized failure types for the deterministic recovery engine."""
    TIMEOUT = "TIMEOUT"
    TOOL_FAILURE = "TOOL_FAILURE"
    LLM_FAILURE = "LLM_FAILURE"
    INVALID_OUTPUT = "INVALID_OUTPUT"
    DEPENDENCY_FAILURE = "DEPENDENCY_FAILURE"
    DATABASE_FAILURE = "DATABASE_FAILURE"
    NETWORK_FAILURE = "NETWORK_FAILURE"
    UNKNOWN = "UNKNOWN"

class SeverityLevel(str, Enum):
    """Severity definitions to prioritize response tactics."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
