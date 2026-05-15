import { create } from 'zustand';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentStep = {
  id: string;
  name: string;
  status: AgentStatus;
  output?: string;
  parallel?: boolean;
};

export type ActivityEntry = {
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

interface IncidentState {
  isInvestigating: boolean;
  currentIncidentId: string | null;
  agentSteps: AgentStep[];
  activityLog: ActivityEntry[];
  traceSpans: TraceSpan[];
  incidentTimeline: TimelineEvent[];
  tasks: InvestigationTask[];
  checkpointEvents: CheckpointEvent[];
  confidenceScore: number | null;
  omiumEnabled: boolean;
  omiumExecutionId: string | null;
  omiumDashboardUrl: string | null;
  causalChain: string | null;
  remediation: string | null;
  rcaReport: string | null;
  startInvestigation: () => Promise<void>;
  connectInvestigation: (incidentId: string) => void;
  updateStepStatus: (id: string, status: 'running' | 'completed' | 'failed', output?: string) => void;
  completeInvestigation: (chain: string, rem: string) => void;
  reset: () => void;
}

const initialSteps: AgentStep[] = [
  { id: 'planner',    name: 'Planner Agent',           status: 'pending' },
  { id: 'log',        name: 'Log Investigation Agent', status: 'pending', parallel: true },
  { id: 'trace',      name: 'Trace Agent',             status: 'pending', parallel: true },
  { id: 'deploy',     name: 'Deployment Agent',        status: 'pending', parallel: true },
  { id: 'memory',     name: 'Memory Agent',            status: 'pending', parallel: true },
  { id: 'correlator', name: 'Correlation Agent',       status: 'pending' },
  { id: 'remediation',name: 'Remediation Agent',       status: 'pending' },
  { id: 'github',     name: 'GitHub Issue',            status: 'pending', parallel: true },
  { id: 'slack',      name: 'Slack Notification',      status: 'pending', parallel: true },
  { id: 'reporter',   name: 'Reporter Agent',          status: 'pending' },
];

const PARALLEL_IDS = ['log', 'trace', 'deploy', 'memory'];

const activityType = (text: string): ActivityEntry['type'] => {
  if (text.includes('[Webhook]') || text.includes('[Log Agent]') || text.includes('timed out')) return 'warn';
  if (text.includes('[Reporter]') || text.includes('[Slack]') || text.includes('[GitHub]') || text.includes('checkpoint')) return 'success';
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
  msg: Record<string, unknown>,
  get: () => IncidentState,
  set: (partial: Partial<IncidentState> | ((s: IncidentState) => Partial<IncidentState>)) => void,
  ws: WebSocket,
) {
  if (msg.error) {
    console.error('WebSocket Error:', msg.error);
    return;
  }

  const nodeMap: Record<string, string> = {
    planner: 'planner',
    log_agent: 'log',
    trace_agent: 'trace',
    deploy_agent: 'deploy',
    memory_agent: 'memory',
    correlator: 'correlator',
    remediator: 'remediation',
    github_issue: 'github',
    slack_notification: 'slack',
    reporter: 'reporter',
  };

  if (Array.isArray(msg.activity) && msg.activity.length > 0) {
    set((state) => ({
      activityLog: [
        ...state.activityLog,
        ...msg.activity.map((text: string) => ({ time: activityTime(), text, type: activityType(text) })),
      ],
    }));
  }

  if (Array.isArray(msg.trace_spans) && msg.trace_spans.length > 0) {
    set((state) => ({ traceSpans: [...state.traceSpans, ...msg.trace_spans] }));
  }

  if (Array.isArray(msg.incident_timeline) && msg.incident_timeline.length > 0) {
    set({ incidentTimeline: msg.incident_timeline as TimelineEvent[] });
  }

  if (Array.isArray(msg.tasks) && msg.tasks.length > 0) {
    set({ tasks: msg.tasks as InvestigationTask[] });
  }

  if (Array.isArray(msg.checkpoint_events) && msg.checkpoint_events.length > 0) {
    set((state) => ({
      checkpointEvents: [...state.checkpointEvents, ...(msg.checkpoint_events as CheckpointEvent[])],
    }));
  }

  if (typeof msg.confidence_score === 'number') {
    set({ confidenceScore: msg.confidence_score });
  }

  if (msg.omium_enabled != null) {
    set({
      omiumEnabled: Boolean(msg.omium_enabled),
      omiumExecutionId: (msg.omium_execution_id as string) ?? null,
      omiumDashboardUrl: (msg.omium_dashboard_url as string) ?? null,
    });
  }

  if (msg.node === 'workflow' && msg.status === 'started') return;

  if (msg.node === 'workflow' && msg.status === 'completed') {
    get().completeInvestigation(get().causalChain || '', get().remediation || '');
    ws.close();
    return;
  }

  const node = msg.node as string;
  const stepId = nodeMap[node];
  if (!stepId) return;

  get().updateStepStatus(stepId, 'completed', msg.output as string | undefined);

  const stateUpdate = msg.state as Record<string, unknown> | undefined;
  if (stateUpdate) {
    if (stateUpdate.probable_root_cause) set({ causalChain: stateUpdate.probable_root_cause as string });
    if (stateUpdate.remediation_action) set({ remediation: stateUpdate.remediation_action as string });
    if (stateUpdate.report_markdown) set({ rcaReport: stateUpdate.report_markdown as string });
  }

  if (stepId === 'planner') {
    PARALLEL_IDS.forEach((id) => get().updateStepStatus(id, 'running'));
  } else if (PARALLEL_IDS.includes(stepId)) {
    const steps = get().agentSteps;
    const allParallelDone = PARALLEL_IDS.every(
      (id) => steps.find((s) => s.id === id)?.status === 'completed',
    );
    if (allParallelDone && steps.find((s) => s.id === 'correlator')?.status !== 'running') {
      get().updateStepStatus('correlator', 'running');
    }
  } else if (stepId === 'correlator') {
    get().updateStepStatus('remediation', 'running');
  } else if (stepId === 'remediation') {
    get().updateStepStatus('github', 'running');
  } else if (node === 'github_issue') {
    get().updateStepStatus('github', 'completed', msg.output as string);
    get().updateStepStatus('slack', 'running');
  } else if (node === 'slack_notification') {
    get().updateStepStatus('slack', 'completed', msg.output as string);
    get().updateStepStatus('reporter', 'running');
  } else if (stepId === 'reporter') {
    get().completeInvestigation(get().causalChain || '', get().remediation || '');
    ws.close();
  }
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  isInvestigating: false,
  currentIncidentId: null,
  agentSteps: initialSteps,
  activityLog: [],
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
  rcaReport: null,

  connectInvestigation: (incidentId: string) => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/incident/${incidentId}`);
    get().updateStepStatus('planner', 'running');

    ws.onmessage = (event) => {
      handleWsMessage(JSON.parse(event.data), get, set, ws);
    };

    ws.onclose = () => {
      if (get().isInvestigating) set({ isInvestigating: false });
    };
  },

  startInvestigation: async () => {
    set({
      isInvestigating: true,
      currentIncidentId: null,
      agentSteps: initialSteps.map((s) => ({ ...s, status: 'pending', output: undefined })),
      activityLog: [],
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
      rcaReport: null,
    });

    try {
      const res = await fetch(`${API_BASE_URL}/simulate`, { method: 'POST' });
      const data = await res.json();
      const incidentId = data.incident_id as string;

      set({
        currentIncidentId: incidentId,
        omiumDashboardUrl: data.omium_dashboard_url ?? null,
      });

      // Live stream via WebSocket (graph runs here). Use POST /simulate?background=true for headless.
      get().connectInvestigation(incidentId);
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

  reset: () =>
    set({
      isInvestigating: false,
      currentIncidentId: null,
      agentSteps: initialSteps,
      activityLog: [],
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
      rcaReport: null,
    }),
}));
