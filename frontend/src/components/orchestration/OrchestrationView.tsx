'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, CheckCircle2, Circle, RefreshCw, AlertTriangle, Layers, Activity, List } from 'lucide-react';
import { useIncidentStore } from '@/store/useIncidentStore';
import OmiumTracePanel from '@/components/orchestration/OmiumTracePanel';
import LiveActivityStream from '@/components/shared/LiveActivityStream';

type NodeStatus = 'idle' | 'running' | 'completed' | 'pending' | 'failed';
interface AgentNode { id: string; label: string; status: NodeStatus; x: number; y: number; parallel?: boolean; }
const priorityColors: Record<string, string> = { high: '#FF6B6B', medium: '#FFB347', low: '#7B9EFF' };

const QUEUE_TASKS = [
  { id: 't1', agent: 'Log Agent',    task: 'Scan error logs — billing-service', priority: 'high' as const },
  { id: 't2', agent: 'Trace Agent',  task: 'Analyse spans for INC-8291',        priority: 'high' as const },
  { id: 't3', agent: 'Deploy Agent', task: 'Diff v2.14.0 vs v2.13.9',           priority: 'medium' as const },
  { id: 't4', agent: 'Correlator',   task: 'Build causal chain from evidence',  priority: 'medium' as const },
];

const statusIcon = (s: NodeStatus) => {
  if (s === 'completed') return <CheckCircle2 size={12} style={{ color: 'var(--so-stable)' }} />;
  if (s === 'running')   return <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--so-primary)' }} />;
  if (s === 'failed')    return <AlertTriangle size={12} style={{ color: 'var(--so-critical)' }} />;
  return <Circle size={12} style={{ color: 'var(--so-text-subtle)' }} />;
};

const nodeColor = (s: NodeStatus) => {
  if (s === 'running')   return 'rgba(168,162,255,0.15)';
  if (s === 'completed') return 'rgba(78,222,158,0.10)';
  if (s === 'failed')    return 'rgba(255,107,107,0.10)';
  if (s === 'pending')   return 'rgba(255,255,255,0.04)';
  return 'transparent';
};

const nodeBorder = (s: NodeStatus) => {
  if (s === 'running')   return 'rgba(168,162,255,0.5)';
  if (s === 'completed') return 'rgba(78,222,158,0.4)';
  if (s === 'failed')    return 'rgba(255,107,107,0.4)';
  return 'rgba(255,255,255,0.06)';
};

export default function OrchestrationView() {
  const { isInvestigating, agentSteps, currentIncidentId, activityLog, tasks } = useIncidentStore();

  const getNodeStatus = (id: string): NodeStatus => {
    const step = agentSteps.find(s => s.id === id);
    if (!step) return 'idle';
    return step.status === 'running' ? 'running'
      : step.status === 'completed' ? 'completed'
      : currentIncidentId ? 'pending'
      : 'idle';
  };

  const nodes: AgentNode[] = [
    { id: 'planner',     label: 'Planner',     status: getNodeStatus('planner'),     x: 300, y: 16 },
    { id: 'log',         label: 'Log Agent',   status: getNodeStatus('log'),         x: 40,  y: 120, parallel: true },
    { id: 'trace',       label: 'Trace Agent', status: getNodeStatus('trace'),       x: 200, y: 120, parallel: true },
    { id: 'deploy',      label: 'Deploy Ag.',  status: getNodeStatus('deploy'),      x: 360, y: 120, parallel: true },
    { id: 'memory',      label: 'Memory Ag.',  status: getNodeStatus('memory'),      x: 520, y: 120, parallel: true },
    { id: 'correlator',  label: 'Correlator',  status: getNodeStatus('correlator'),  x: 300, y: 230 },
    { id: 'remediation', label: 'Remediation', status: getNodeStatus('remediation'), x: 300, y: 340 },
    { id: 'github',      label: 'GitHub',      status: getNodeStatus('github'),      x: 190, y: 450, parallel: true },
    { id: 'slack',       label: 'Slack',       status: getNodeStatus('slack'),       x: 410, y: 450, parallel: true },
    { id: 'reporter',    label: 'Reporter',    status: getNodeStatus('reporter'),    x: 300, y: 550 },
  ];

  const edges = [
    ['planner','log'], ['planner','trace'], ['planner','deploy'], ['planner','memory'],
    ['log','correlator'], ['trace','correlator'], ['deploy','correlator'], ['memory','correlator'],
    ['correlator','remediation'], ['remediation','github'], ['remediation','slack'],
    ['github','reporter'], ['slack','reporter'],
  ];

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const completedCount = agentSteps.filter(s => s.status === 'completed').length;
  const isComplete = currentIncidentId && completedCount === agentSteps.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>Orchestration</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-muted)' }}>
            {currentIncidentId ? `Workflow: ${currentIncidentId} — ${completedCount}/${agentSteps.length} agents done` : 'Monitoring autonomous AI workflows across 7 active agents.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: isInvestigating ? 'var(--so-primary)' : isComplete ? 'var(--so-stable)' : 'var(--so-text-muted)' }}>
          <Activity size={14} />
          <span>{isInvestigating ? 'Live' : isComplete ? 'Complete' : 'Idle'}</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Agent Graph */}
        <div className="flex-1 flex flex-col border-r" style={{ borderColor: 'var(--so-border)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b text-[11px] font-semibold uppercase tracking-widest" style={{ borderColor: 'var(--so-border)', color: 'var(--so-text-muted)' }}>
            <Layers size={13} /> Live Topology
          </div>
          <div className="flex-1 overflow-auto p-6">
            {!currentIncidentId ? (
              <div className="flex h-full items-center justify-center flex-col gap-3">
                <GitBranch size={32} style={{ color: 'var(--so-text-subtle)', opacity: 0.4 }} />
                <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>No active workflow</p>
                <p className="text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>Trigger a simulation from the Command Center</p>
              </div>
            ) : (
              <div className="relative mx-auto" style={{ height: '660px', width: '720px' }}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {edges.map(([fromId, toId], i) => {
                    const from = nodeMap[fromId]; const to = nodeMap[toId];
                    if (!from || !to) return null;
                    const fx = from.x + 64; const fy = from.y + 20;
                    const tx = to.x + 64;   const ty = to.y;
                    const isActive = from.status === 'completed' || from.status === 'running';
                    return (
                      <motion.line key={i} x1={fx} y1={fy} x2={tx} y2={ty}
                        stroke={isActive ? 'rgba(168,162,255,0.4)' : 'rgba(255,255,255,0.06)'}
                        strokeWidth={isActive ? 1.5 : 1}
                        strokeDasharray={isActive ? 'none' : '4 4'}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      />
                    );
                  })}
                </svg>
                {nodes.map((node, i) => (
                  <motion.div key={node.id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06, type: 'spring', stiffness: 280, damping: 22 }}
                    className="absolute flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
                    style={{
                      left: node.x, top: node.y, width: 128, zIndex: 1,
                      background: nodeColor(node.status),
                      border: `1px solid ${nodeBorder(node.status)}`,
                      color: node.status === 'idle' || node.status === 'pending' ? 'var(--so-text-muted)' : 'var(--so-text)',
                      boxShadow: node.status === 'running' ? '0 0 14px rgba(168,162,255,0.2)' : 'none',
                    }}>
                    {statusIcon(node.status)}
                    <span className="truncate">{node.label}</span>
                    {node.parallel && node.status === 'running' && (
                      <span className="ml-auto text-[9px] font-bold px-1 rounded" style={{ background: 'rgba(168,162,255,0.2)', color: 'var(--so-primary)' }}>‖</span>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[280px] shrink-0 flex flex-col">
          <div className="border-b flex-1 flex flex-col" style={{ borderColor: 'var(--so-border)', maxHeight: '50%' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b text-[11px] font-semibold uppercase tracking-widest" style={{ borderColor: 'var(--so-border)', color: 'var(--so-text-muted)' }}>
              <List size={13} /> Pending Tasks
            </div>
            <div className="p-3 space-y-1.5 overflow-y-auto">
              <AnimatePresence>
                {(currentIncidentId
                  ? (tasks.length > 0
                    ? tasks.map((t) => ({
                        id: t.id,
                        agent: t.assigned_agent.replace(/_/g, ' '),
                        task: t.objective,
                        priority: (t.status === 'completed' ? 'low' : 'high') as 'high' | 'medium' | 'low',
                      }))
                    : QUEUE_TASKS)
                  : []
                ).map((task, i) => (
                  <motion.div key={task.id}
                    initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2.5 p-2.5 rounded-md"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--so-border)' }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: priorityColors[task.priority] }} />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] font-medium truncate" style={{ color: 'var(--so-primary)' }}>{task.agent}</span>
                      <span className="text-[10px] leading-snug" style={{ color: 'var(--so-text-muted)' }}>{task.task}</span>
                    </div>
                  </motion.div>
                ))}
                {!currentIncidentId && (
                  <p className="text-[11px] text-center py-4" style={{ color: 'var(--so-text-subtle)' }}>No pending tasks</p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <OmiumTracePanel />

          <div className="flex flex-col flex-1 min-h-0">
            <LiveActivityStream />
          </div>
        </div>
      </div>
    </div>
  );
}
