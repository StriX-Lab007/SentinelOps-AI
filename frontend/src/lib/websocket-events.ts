/**
 * WebSocket event type definitions for SentinelOps.
 * Structured event types enable type-safe, event-driven architecture.
 */

export type WebSocketEventType =
  | "agent_started"
  | "agent_completed"
  | "activity"
  | "confidence_update"
  | "timeline_event"
  | "integration"
  | "root_cause_update"
  | "remediation_update"
  | "planner_output"
  | "snapshot_event";

export type SnapshotEvent = {
  type: "snapshot_event";
  agent: string;
  status: 'stored' | 'failed' | 'recovered' | 'replayed';
  message: string;
  timestamp: string;
};

export type PlannerTask = {
  agent: string;
  objective: string;
};

export type PlannerOutputEvent = {
  type: "planner_output";
  incident_type: string;
  tasks: PlannerTask[];
  timestamp: string;
};

export type AgentStartedEvent = {
  type: "agent_started";
  agent: string;
  timestamp: string;
};

export type AgentCompletedEvent = {
  type: "agent_completed";
  agent: string;
  summary: string;
  timestamp: string;
};

export type ActivityEventMessage = {
  type: "activity";
  message: string;
  severity: "info" | "warn" | "error" | "success";
  timestamp: string;
};

export type ConfidenceUpdateEvent = {
  type: "confidence_update";
  value: number;
  timestamp: string;
};

export type TimelineEventMessage = {
  type: "timeline_event";
  title: string;
  time: string;
  timestamp: string;
};

export type IntegrationEventMessage = {
  type: "integration";
  service: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  message: string;
  timestamp: string;
};

export type RootCauseUpdateEvent = {
  type: "root_cause_update";
  rootCause: string;
  confidence: number;
  timestamp: string;
};

export type RemediationUpdateEvent = {
  type: "remediation_update";
  action: string;
  remediation: string;
  remediation_command?: string;
  requires_approval?: boolean;
  timestamp: string;
};

// Discriminated union of all event types
export type WebSocketEvent =
  | AgentStartedEvent
  | AgentCompletedEvent
  | ActivityEventMessage
  | ConfidenceUpdateEvent
  | TimelineEventMessage
  | IntegrationEventMessage
  | RootCauseUpdateEvent
  | RemediationUpdateEvent
  | SnapshotEvent
  | PlannerOutputEvent
  | InterventionRequiredEvent
  | InterventionResolvedEvent;

export interface InterventionRequiredEvent {
  type: 'intervention_required';
  incident_id: string;
  agent: string;
  reason: string;
  confidence: number;
  timestamp: string;
}

export interface InterventionResolvedEvent {
  type: 'intervention_resolved';
  incident_id: string;
  status: 'approved' | 'rejected';
  agent: string;
  timestamp: string;
}

/**
 * Type guard functions for discriminating event types.
 */

export function isPlannerOutputEvent(event: unknown): event is PlannerOutputEvent {
  return typeof event === "object" && event !== null && (event as any).type === "planner_output";
}

export function isAgentStartedEvent(event: unknown): event is AgentStartedEvent {
  return typeof event === "object" && event !== null && (event as any).type === "agent_started";
}

export function isAgentCompletedEvent(event: unknown): event is AgentCompletedEvent {
  return typeof event === "object" && event !== null && (event as any).type === "agent_completed";
}

export function isActivityEvent(event: unknown): event is ActivityEventMessage {
  return typeof event === "object" && event !== null && (event as any).type === "activity";
}

export function isConfidenceUpdateEvent(event: unknown): event is ConfidenceUpdateEvent {
  return typeof event === "object" && event !== null && (event as any).type === "confidence_update";
}

export function isTimelineEvent(event: unknown): event is TimelineEventMessage {
  return typeof event === "object" && event !== null && (event as any).type === "timeline_event";
}

export function isIntegrationEvent(event: unknown): event is IntegrationEventMessage {
  return typeof event === "object" && event !== null && (event as any).type === "integration";
}

export function isRootCauseUpdateEvent(event: unknown): event is RootCauseUpdateEvent {
  return typeof event === "object" && event !== null && (event as any).type === "root_cause_update";
}

export function isRemediationUpdateEvent(event: unknown): event is RemediationUpdateEvent {
  return typeof event === "object" && event !== null && (event as any).type === "remediation_update";
}

export function isSnapshotEvent(event: unknown): event is SnapshotEvent {
  return typeof event === "object" && event !== null && (event as any).type === "snapshot_event";
}

export function isInterventionRequiredEvent(event: unknown): event is InterventionRequiredEvent {
  return typeof event === "object" && event !== null && (event as any).type === "intervention_required";
}

export function isInterventionResolvedEvent(event: unknown): event is InterventionResolvedEvent {
  return typeof event === "object" && event !== null && (event as any).type === "intervention_resolved";
}
