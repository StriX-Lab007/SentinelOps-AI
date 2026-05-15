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

interface IncidentState {
  isInvestigating: boolean;
  currentIncidentId: string | null;
  agentSteps: AgentStep[];
  activityLog: ActivityEntry[];
  traceSpans: TraceSpan[];
  causalChain: string | null;
  remediation: string | null;
  rcaReport: string | null;
  startInvestigation: () => Promise<void>;
  updateStepStatus: (id: string, status: 'running' | 'completed' | 'failed', output?: string) => void;
  completeInvestigation: (chain: string, rem: string) => void;
  reset: () => void;
}

const initialSteps: AgentStep[] = [
  { id: 'planner',    name: 'Planner Agent',          status: 'pending' },
  { id: 'log',        name: 'Log Investigation Agent', status: 'pending', parallel: true },
  { id: 'trace',      name: 'Trace Agent',             status: 'pending', parallel: true },
  { id: 'deploy',     name: 'Deployment Agent',        status: 'pending', parallel: true },
  { id: 'correlator', name: 'Correlation Agent',       status: 'pending' },
  { id: 'remediation',name: 'Remediation Agent',       status: 'pending' },
  { id: 'github',     name: 'GitHub Issue',            status: 'pending', parallel: true },
  { id: 'slack',      name: 'Slack Notification',       status: 'pending', parallel: true },
  { id: 'reporter',   name: 'Reporter Agent',          status: 'pending' },
];

const activityType = (text: string): ActivityEntry['type'] => {
  if (text.includes('[Webhook]') || text.includes('[Log Agent]')) return 'warn';
  if (text.includes('[Reporter]') || text.includes('[Slack]') || text.includes('[GitHub]')) return 'success';
  return 'info';
};

const activityTime = () => new Date().toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

export const useIncidentStore = create<IncidentState>((set, get) => ({
  isInvestigating: false,
  currentIncidentId: null,
  agentSteps: initialSteps,
  activityLog: [],
  traceSpans: [],
  causalChain: null,
  remediation: null,
  rcaReport: null,

  startInvestigation: async () => {
    // Reset state before starting
    set({
      isInvestigating: true,
      currentIncidentId: null,
      agentSteps: initialSteps.map(s => ({ ...s, status: 'pending', output: undefined })),
      activityLog: [],
      traceSpans: [],
      causalChain: null,
      remediation: null,
      rcaReport: null,
    });

    try {
      // 1. Trigger Simulation Endpoint
      const res = await fetch(`${API_BASE_URL}/simulate`, { method: 'POST' });
      const data = await res.json();
      const incidentId = data.incident_id;

      set({ currentIncidentId: incidentId });

      // 2. Open WebSocket to stream LangGraph execution
      const ws = new WebSocket(`${WS_BASE_URL}/ws/incident/${incidentId}`);

      // When starting, set planner to running
      get().updateStepStatus('planner', 'running');

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.error) {
          console.error("WebSocket Error:", msg.error);
          return;
        }

        const nodeMap: Record<string, string> = {
          'planner': 'planner',
          'log_agent': 'log',
          'trace_agent': 'trace',
          'deploy_agent': 'deploy',
          'correlator': 'correlator',
          'remediator': 'remediation',
          'github_issue': 'github',
          'slack_notification': 'slack',
          'reporter': 'reporter'
        };

        if (Array.isArray(msg.activity) && msg.activity.length > 0) {
          set((state) => ({
            activityLog: [
              ...state.activityLog,
              ...msg.activity.map((text: string) => ({ time: activityTime(), text, type: activityType(text) }))
            ]
          }));
        }

        if (Array.isArray(msg.trace_spans) && msg.trace_spans.length > 0) {
          set((state) => ({
            traceSpans: [...state.traceSpans, ...msg.trace_spans]
          }));
        }

        const stepId = nodeMap[msg.node];
        if (!stepId) return;

        // Mark the completed node
        get().updateStepStatus(stepId, 'completed', msg.output);

        // State updates for UI
        if (msg.state) {
          if (msg.state.root_cause) {
            set({ causalChain: msg.state.root_cause });
          }
          if (msg.state.remediation) {
            set({ remediation: msg.state.remediation });
          }
          if (msg.state.report) {
            set({ rcaReport: msg.state.report });
          }
        }

        // Logic to transition next steps to 'running'
        if (stepId === 'planner') {
          // Parallel agents launch
          get().updateStepStatus('log', 'running');
          get().updateStepStatus('trace', 'running');
          get().updateStepStatus('deploy', 'running');
        } else if (['log', 'trace', 'deploy'].includes(stepId)) {
          // Check if all three parallel are done
          const steps = get().agentSteps;
          const allParallelDone = ['log', 'trace', 'deploy'].every(
            id => steps.find(s => s.id === id)?.status === 'completed'
          );
          if (allParallelDone && steps.find(s => s.id === 'correlator')?.status !== 'running') {
            get().updateStepStatus('correlator', 'running');
          }
        } else if (stepId === 'correlator') {
          get().updateStepStatus('remediation', 'running');
        } else if (stepId === 'remediation') {
          get().updateStepStatus('github', 'running');
          get().updateStepStatus('slack', 'running');
        } else if (['github', 'slack'].includes(stepId)) {
          const steps = get().agentSteps;
          const allSideEffectsDone = ['github', 'slack'].every(
            id => steps.find(s => s.id === id)?.status === 'completed'
          );
          if (allSideEffectsDone && steps.find(s => s.id === 'reporter')?.status !== 'running') {
            get().updateStepStatus('reporter', 'running');
          }
        } else if (stepId === 'reporter') {
          // Finish workflow
          get().completeInvestigation(get().causalChain || '', get().remediation || '');
          ws.close();
        }
      };

      ws.onclose = () => {
        // Just in case it closed early without finishing
        if (get().isInvestigating) {
          set({ isInvestigating: false });
        }
      };

    } catch (err) {
      console.error("Failed to start investigation:", err);
      set({ isInvestigating: false });
    }
  },

  updateStepStatus: (id, status, output) => set((state) => ({
    agentSteps: state.agentSteps.map(step =>
      step.id === id ? { ...step, status, output: output ?? step.output } : step
    )
  })),

  completeInvestigation: (chain, rem) => set((state) => ({
    isInvestigating: false,
    causalChain: chain,
    remediation: rem,
    rcaReport: `# RCA Report — ${state.currentIncidentId}\n\n## Summary\n${chain}\n\n## Remediation\n${rem}`,
  })),

  reset: () => set({
    isInvestigating: false,
    currentIncidentId: null,
    agentSteps: initialSteps,
    activityLog: [],
    traceSpans: [],
    causalChain: null,
    remediation: null,
    rcaReport: null,
  }),
}));
