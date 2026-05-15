import { create } from 'zustand';
import {
  WebSocketEvent,
  isAgentStartedEvent,
  isAgentCompletedEvent,
  isActivityEvent,
  isConfidenceUpdateEvent,
  isTimelineEvent,
  isIntegrationEvent,
  isRootCauseUpdateEvent,
  isRemediationUpdateEvent,
  isSnapshotEvent,
  isPlannerOutputEvent,
  isInterventionRequiredEvent,
  isInterventionResolvedEvent,
} from '@/lib/websocket-events';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentStep = {
  id: string;
  name: string;
  status: AgentStatus;
  output?: string;
  parallel?: boolean;
};

export type ActivityEntry = {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'warn' | 'success' | 'error';
};

export type TraceSpan = {
  name: string;
  parent: string | null;
  status: string;
  output: string;
  timestamp: string;
};

export type TimelineEvent = {
  time: string;
  event: string;
  type: 'deploy' | 'warn' | 'critical' | 'info' | 'success';
};

export type InvestigationTask = {
  id: string;
  assigned_agent: string;
  objective: string;
  status: string;
  findings?: string[];
};

export type CheckpointEvent = {
  name: string;
  agent: string;
  action: string;
  replay_from?: string;
  replay_url?: string | null;
  omium_enabled?: boolean;
};

export type SnapshotEntry = {
  id: string;
  time: string;
  agent: string;
  status: 'stored' | 'failed' | 'recovered' | 'replayed';
  message: string;
};

export type InterventionData = {
  incident_id: string;
  agent: string;
  reason: string;
  confidence: number;
  timestamp: string;
};

export type RuntimeEvent = {
  id: string;
  type: string;
  agent: string;
  severity: string;
  payload: any;
  timestamp: string;
};

interface IncidentState {
  isInvestigating: boolean;
  currentIncidentId: string | null;
  agentSteps: AgentStep[];
  activityLog: ActivityEntry[];
  snapshotLog: SnapshotEntry[];
  runtimeEvents: RuntimeEvent[];
  traceSpans: TraceSpan[];
  incidentTimeline: TimelineEvent[];
  tasks: InvestigationTask[];
  checkpointEvents: CheckpointEvent[];
  confidenceScore: number | null;
  omiumEnabled: boolean;
  omiumExecutionId: string | null;
  omiumDashboardUrl: string | null;
  incidentType: string | null;
  causalChain: string | null;
  remediation: string | null;
  remediationCommand: string | null;
  requiresApproval: boolean;
  pendingIntervention: InterventionData | null;
  rcaReport: string | null;
  startInvestigation: (simulateFailures?: string | boolean) => Promise<void>;
  connectInvestigation: (streamPath: string) => void;
  updateStepStatus: (id: string, status: 'running' | 'completed' | 'failed', output?: string) => void;
  completeInvestigation: (chain: string, rem: string) => void;
  resolveIntervention: (action: 'approve' | 'reject') => Promise<void>;
  reset: () => void;
}

const initialSteps: AgentStep[] = [
  { id: 'planner',    name: 'Planner Agent',           status: 'pending' },
  { id: 'log',        name: 'Log Investigation Agent', status: 'pending', parallel: true },
  { id: 'trace',      name: 'Trace Agent',             status: 'pending', parallel: true },
  { id: 'deploy',     name: 'Deployment Agent',        status: 'pending', parallel: true },
  { id: 'memory',     name: 'Memory Agent',            status: 'pending', parallel: true },
  { id: 'logging',    name: 'Logging Agent (Memory)',  status: 'pending' },
  { id: 'recovery',   name: 'Recovery Agent (Heal)',   status: 'pending' },
  { id: 'correlator', name: 'Correlation Agent',       status: 'pending' },
  { id: 'remediation',name: 'Remediation Agent',       status: 'pending' },
  { id: 'github',     name: 'GitHub Issue',            status: 'pending', parallel: true },
  { id: 'slack',      name: 'Slack Notification',      status: 'pending', parallel: true },
  { id: 'reporter',   name: 'Reporter Agent',          status: 'pending' },
];

const PARALLEL_IDS = ['log', 'trace', 'deploy', 'memory'];

let _actSeq = 0;
const actId = () => `ev-${Date.now()}-${++_actSeq}`;

const activityType = (text: string): ActivityEntry['type'] => {
  if (text.includes('[Webhook]') || text.includes('[Log Agent]') || text.includes('timed out')) return 'warn';
  if (text.includes('[Reporter]') || text.includes('[Slack]') || text.includes('[GitHub]') || text.includes('checkpoint')) return 'success';
  if (text.includes('Confidence') || text.includes('confidence')) return 'info';
  return 'info';
};

const activityTime = () => new Date().toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

function handleWsMessage(
  msg: unknown,
  get: () => IncidentState,
  set: (partial: Partial<IncidentState> | ((s: IncidentState) => Partial<IncidentState>)) => void,
  ws: WebSocket,
) {
  if (!msg || typeof msg !== 'object') return;
  const event = msg as any;

  const nodeMap: Record<string, string> = {
    planner: 'planner',
    log_agent: 'log',
    trace_agent: 'trace',
    deploy_agent: 'deploy',
    memory_agent: 'memory',
    logging_agent: 'logging',
    recovery_agent: 'recovery',
    correlator: 'correlator',
    remediator: 'remediation',
    github_issue: 'github',
    slack_notification: 'slack',
    reporter: 'reporter',
  };

  // 0. Planner Structured Output
  if (isPlannerOutputEvent(event)) {
    set({
      incidentType: event.incident_type,
      tasks: event.tasks.map((t, idx) => ({
        id: `task-${idx}`,
        assigned_agent: t.agent,
        objective: t.objective,
        status: 'assigned',
      })),
    });
    
    set((state) => ({
      activityLog: [
        ...state.activityLog,
        { id: actId(), time: activityTime(), text: `Orchestration plan generated for: ${event.incident_type}`, type: 'success' },
      ],
    }));
  }

  // 1. Agent Transitions
  if (isAgentStartedEvent(event)) {
    const stepId = nodeMap[event.agent];
    if (stepId) get().updateStepStatus(stepId, 'running');
  }

  if (isAgentCompletedEvent(event)) {
    const stepId = nodeMap[event.agent];
    if (stepId) get().updateStepStatus(stepId, 'completed', event.summary);
    
    // Auto-close if reporter finishes
    if (event.agent === 'reporter') {
      get().completeInvestigation(get().causalChain || '', get().remediation || '');
      ws.close();
    }
  }

  // 2. Activity Log
  if (isActivityEvent(event)) {
    set((state) => ({
      activityLog: [
        ...state.activityLog,
        {
          id: actId(),
          time: event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : activityTime(),
          text: event.message,
          type: event.severity || 'info',
        },
      ],
    }));
  }

  // 3. Confidence Evolution
  if (isConfidenceUpdateEvent(event)) {
    const pct = Math.round(event.value * 100);
    set((state) => ({
      confidenceScore: event.value,
      activityLog: [
        ...state.activityLog,
        { id: actId(), time: activityTime(), text: `Correlation confidence raised to ${pct}%`, type: 'info' as const },
      ],
    }));
  }

  // 4. Incident Timeline
  if (isTimelineEvent(event)) {
    set((state) => {
      // Avoid duplicates
      const exists = state.incidentTimeline.some(t => t.event === event.title && t.time === event.time);
      if (exists) return state;
      return {
        incidentTimeline: [
          ...state.incidentTimeline,
          { time: event.time, event: event.title, type: 'info' }
        ]
      };
    });
  }

  // 5. Integrations & Side-Effects
  if (isIntegrationEvent(event)) {
    set((state) => ({
      activityLog: [
        ...state.activityLog,
        { 
          id: actId(), 
          time: activityTime(), 
          text: `[Integration] ${event.message}`, 
          type: event.status === 'completed' ? 'success' : 'warn' 
        },
      ],
    }));
  }

  // 5b. Execution Snapshots
  if (isSnapshotEvent(event)) {
    const stepId = nodeMap[event.agent];
    if (stepId) {
      if (event.status === 'failed') {
        get().updateStepStatus(stepId, 'failed', event.message);
      } else if (event.status === 'recovered' || event.status === 'replayed') {
        get().updateStepStatus(stepId, 'running', 'Recovering from snapshot...');
      }
    }

    set((state) => ({
      snapshotLog: [
        ...state.snapshotLog,
        {
          id: actId(),
          time: event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : activityTime(),
          agent: event.agent,
          status: event.status,
          message: event.message
        }
      ]
    }));
  }

  // 6. Data Convergence
  if (isRootCauseUpdateEvent(event)) {
    set({ causalChain: event.rootCause, confidenceScore: event.confidence });
  }

  if (isRemediationUpdateEvent(event)) {
    set({ 
      remediation: event.remediation, 
      remediationCommand: event.remediation_command ?? null,
      requiresApproval: event.requires_approval ?? false,
    });
  }

  // 7. Human in the loop Interventions
  if (isInterventionRequiredEvent(event)) {
    set({
      pendingIntervention: {
        incident_id: event.incident_id,
        agent: event.agent,
        reason: event.reason,
        confidence: event.confidence,
        timestamp: event.timestamp
      }
    });
  }

  // 8. Telemetry Events
  if (event.type === 'telemetry_event') {
    set((state) => ({
      // Cap at 100 entries to prevent unbounded memory growth from long investigations
      runtimeEvents: [
        ...state.runtimeEvents.slice(-99),
        {
          id: actId(),
          type: event.event_type,
          agent: event.agent,
          severity: event.severity,
          payload: event.payload,
          timestamp: event.timestamp || activityTime(),
        }
      ]
    }));
  }

  if (isInterventionResolvedEvent(event)) {
    set((state) => {
      // Clear pending intervention if it matches
      if (state.pendingIntervention?.incident_id === event.incident_id) {
        return { pendingIntervention: null };
      }
      return {};
    });
    set((state) => ({
      activityLog: [
        ...state.activityLog,
        { id: actId(), time: activityTime(), text: `Operator ${event.status} recovery action for ${event.agent}`, type: event.status === 'approved' ? 'success' : 'warn' },
      ],
    }));
  }
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  isInvestigating: false,
  currentIncidentId: null,
  agentSteps: initialSteps,
  activityLog: [],
  snapshotLog: [],
  runtimeEvents: [],
  traceSpans: [],
  incidentTimeline: [],
  tasks: [],
  checkpointEvents: [],
  confidenceScore: null,
  omiumEnabled: false,
  omiumExecutionId: null,
  omiumDashboardUrl: null,
  incidentType: null,
  causalChain: null,
  remediation: null,
  remediationCommand: null,
  requiresApproval: false,
  pendingIntervention: null,
  rcaReport: null,

  connectInvestigation: (streamPath: string) => {
    const ws = new WebSocket(`${WS_BASE_URL}${streamPath}`);
    get().updateStepStatus('planner', 'running');

    ws.onmessage = (event) => {
      try {
        handleWsMessage(JSON.parse(event.data), get, set, ws);
      } catch (e) {
        console.warn('[WS] Failed to parse message:', event.data, e);
      }
    };

    ws.onerror = () => {
      // onerror does not always trigger onclose — ensure isInvestigating is cleared
      // so the UI doesn't stay stuck in a loading state.
      if (get().isInvestigating) set({ isInvestigating: false });
    };

    ws.onclose = () => {
      if (get().isInvestigating) set({ isInvestigating: false });
    };
  },

  startInvestigation: async (simulateFailures: string | boolean = false) => {
    set({
      isInvestigating: true,
      currentIncidentId: null,
      agentSteps: initialSteps.map((s) => ({ ...s, status: 'pending', output: undefined })),
      activityLog: [],
      snapshotLog: [],
      runtimeEvents: [],
      traceSpans: [],
      incidentTimeline: [],
      tasks: [],
      checkpointEvents: [],
      confidenceScore: null,
      omiumEnabled: false,
      omiumExecutionId: null,
      omiumDashboardUrl: null,
      incidentType: null,
      causalChain: null,
      remediation: null,
      remediationCommand: null,
      requiresApproval: false,
      pendingIntervention: null,
      rcaReport: null,
    });

    try {
      const qs = simulateFailures === true ? 'true' : (simulateFailures || '');
      const res = await fetch(`${API_BASE_URL}/simulate?simulate_failures=${qs}`, { method: 'POST' });
      const data = await res.json();
      const incidentId = data.incident_id as string;
      const streamPath = data.stream as string;

      set({
        currentIncidentId: incidentId,
        omiumDashboardUrl: data.omium_dashboard_url ?? null,
      });

      // Live stream via WebSocket (graph runs here).
      get().connectInvestigation(streamPath);
    } catch (err) {
      console.error('Failed to start investigation:', err);
      set({ isInvestigating: false });
    }
  },

  updateStepStatus: (id, status, output) =>
    set((state) => ({
      agentSteps: state.agentSteps.map((step) =>
        step.id === id ? { ...step, status, output: output ?? step.output } : step,
      ),
    })),

  completeInvestigation: (chain, rem) =>
    set((state) => ({
      isInvestigating: false,
      causalChain: chain,
      remediation: rem,
      rcaReport:
        state.rcaReport ||
        `# RCA Report — ${state.currentIncidentId}\n\n## Summary\n${chain}\n\n## Remediation\n${rem}`,
    })),

  resolveIntervention: async (action: 'approve' | 'reject') => {
    const state = get();
    if (!state.currentIncidentId || !state.pendingIntervention) return;
    
    // Optimistic UI update
    set({ pendingIntervention: null });
    
    try {
      await fetch(`${API_BASE_URL}/api/v1/recovery/${state.currentIncidentId}/${action}`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to resolve intervention:', err);
    }
  },

  reset: () =>
    set({
      isInvestigating: false,
      currentIncidentId: null,
      incidentType: null,
      agentSteps: initialSteps,
      activityLog: [],
      snapshotLog: [],
      traceSpans: [],
      incidentTimeline: [],
      tasks: [],
      checkpointEvents: [],
      confidenceScore: null,
      omiumEnabled: false,
      omiumExecutionId: null,
      omiumDashboardUrl: null,
      causalChain: null,
      remediation: null,
      remediationCommand: null,
      requiresApproval: false,
      pendingIntervention: null,
      rcaReport: null,
    }),
}));
