'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, GitBranch, Activity, Zap,
  Clock, CheckCircle2,
  Circle, RefreshCw, XCircle, ArrowUpRight, Download, Terminal, Globe
} from 'lucide-react';
import { useIncidentStore, type AgentStep, type InvestigationTask, type TimelineEvent, type ActivityEntry, API_BASE_URL } from '@/store/useIncidentStore';
import LiveActivityStream from '@/components/shared/LiveActivityStream';
import WebhookIntegrationPanel from '@/components/shared/WebhookIntegrationPanel';
import RuntimeMemoryPanel from '@/components/shared/RuntimeMemoryPanel';
import DemoControls from './DemoControls';
import RuntimeEventStream from './RuntimeEventStream';

// --- Types ---
type Severity = 'critical' | 'high' | 'medium';
interface Incident {
  id: string; title: string; service: string;
  severity: Severity; time: string; status: 'investigating' | 'stable' | 'resolved';
}

// --- Static mock data ---
const INCIDENTS: Incident[] = [
  { id: 'INC-8291', title: 'P99 Latency Spike in billing-service', service: 'billing-svc', severity: 'critical', time: '2m ago', status: 'investigating' },
  { id: 'INC-8290', title: 'Auth token validation failures', service: 'auth-svc',    severity: 'high',     time: '14m ago', status: 'stable' },
  { id: 'INC-8289', title: 'Background job queue depth elevated', service: 'worker-svc', severity: 'medium', time: '31m ago', status: 'resolved' },
];

const sevConfig = {
  critical: { color: '#FF6B6B', bg: 'rgba(255,107,107,0.12)', label: 'CRITICAL' },
  high:     { color: '#FFB347', bg: 'rgba(255,179,71,0.12)',  label: 'HIGH' },
  medium:   { color: '#FFD700', bg: 'rgba(255,215,0,0.12)',   label: 'MEDIUM' },
};
const statusConfig = {
  investigating: { color: '#FF6B6B', label: 'Investigating' },
  stable:        { color: '#FFB347', label: 'Stable' },
  resolved:      { color: '#4EDE9E', label: 'Resolved' },
};

// --- Sub-components ---
const SeverityBadge = ({ sev }: { sev: Severity }) => {
  const c = sevConfig[sev];
  return (
    <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
      style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
};

const AgentStepRow = ({ step, idx }: { step: AgentStep; idx: number }) => {
  const icons: Record<AgentStep['status'], React.ReactNode> = {
    pending:   <Circle size={13} style={{ color: 'var(--so-text-subtle)', opacity: 0.3 }} />,
    running:   <RefreshCw size={13} className="animate-spin" style={{ color: 'var(--so-primary)' }} />,
    completed: <CheckCircle2 size={13} style={{ color: 'var(--so-stable)' }} />,
    failed:    <AlertTriangle size={13} style={{ color: 'var(--so-critical)' }} />
  };
  const isRunning = step.status === 'running';
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04 }}
      className="flex items-start gap-3 py-2 px-3 rounded-md transition-all duration-300"
      style={{ 
        background: isRunning ? 'rgba(168,162,255,0.06)' : 'transparent',
        border: isRunning ? '1px solid rgba(168,162,255,0.15)' : '1px solid transparent',
        opacity: step.status === 'pending' ? 0.6 : 1
      }}
    >
      <span className="mt-0.5 shrink-0 relative">
        {icons[step.status]}
        {isRunning && (
          <span className="absolute -inset-1 rounded-full animate-pulse bg-indigo-500/10" />
        )}
      </span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[12px] font-medium flex items-center gap-2"
          style={{ color: step.status === 'completed' ? 'var(--so-text)' : step.status === 'running' ? 'var(--so-primary)' : step.status === 'failed' ? 'var(--so-warn)' : 'var(--so-text-muted)' }}>
          {step.name}
          {step.status === 'failed' && (
            <span className="text-[9px] uppercase tracking-wider bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">Failed</span>
          )}
        </span>
        {step.output && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-[11px] leading-relaxed" style={{ color: 'var(--so-text-muted)' }}>
            {step.output}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
};

const ConfidenceMeter = ({ value }: { value: number | null }) => {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="mb-8 px-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--so-text-subtle)' }}>Evidence Correlation</span>
        <span className="text-[14px] font-mono font-bold" style={{ color: pct > 85 ? 'var(--so-stable)' : 'var(--so-primary)' }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 50, damping: 20 }}
          className="h-full shadow-[0_0_10px_rgba(168,162,255,0.3)]"
          style={{ background: pct > 85 ? 'var(--so-stable)' : 'var(--so-primary)' }}
        />
      </div>
    </div>
  );
};

const TimelineReconstruction = ({ events }: { events: TimelineEvent[] }) => {
  if (events.length === 0) return null;
  return (
    <div className="mt-10 border-t pt-8 px-2" style={{ borderColor: 'var(--so-border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-6" style={{ color: 'var(--so-text-subtle)' }}>Causal Reconstruction</p>
      <div className="space-y-6">
        {events.map((ev, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="flex gap-4 relative">
            {i < events.length - 1 && (
              <div className="absolute left-[15px] top-6 bottom-[-24px] w-[1px] bg-white/[0.06]" />
            )}
            <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-center shrink-0 z-10 text-[9px] font-mono"
                 style={{ color: 'var(--so-text-subtle)' }}>
               {ev.time.split(' ')[0]}
            </div>
            <div className="pt-1.5 flex-1">
               <p className="text-[12px] font-medium leading-tight" style={{ color: 'var(--so-text-muted)' }}>{ev.event}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const PlannerTasks = ({ tasks, incidentType }: { tasks: InvestigationTask[], incidentType: string | null }) => {
  if (tasks.length === 0) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5"
    >
       <div className="flex items-center gap-2 mb-4">
         <Activity size={14} className="text-indigo-400" />
         <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Swarm Orchestration Plan</span>
         {incidentType && (
            <span className="ml-auto text-[10px] font-mono bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300">
              {incidentType.replace('_', ' ').toUpperCase()}
            </span>
         )}
       </div>
       <div className="space-y-3">
         {tasks.map((task) => (
           <div key={task.id} className="flex items-start gap-3">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
             <div className="flex-1">
               <p className="text-[12px] font-medium text-white/90 leading-tight">
                 <span className="text-indigo-400 font-bold uppercase text-[9px] mr-1.5 tracking-wider">[{task.assigned_agent.replace('_agent', '').toUpperCase()}]</span>
                 {task.objective}
               </p>
             </div>
           </div>
         ))}
       </div>
    </motion.div>
  );
};

// --- Main Component ---
export default function CommandCenter({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { isInvestigating, currentIncidentId, incidentType, agentSteps, incidentTimeline, confidenceScore,
          tasks, causalChain, remediation, remediationCommand, requiresApproval, startInvestigation } = useIncidentStore();
  const [elapsed, setElapsed] = useState(0);
  const [isWebhookOpen, setIsWebhookOpen] = useState(false);

  // Tick elapsed
  useEffect(() => {
    if (!isInvestigating) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isInvestigating]);

  // Metrics bar
  const metrics = [
    { label: 'Active Incidents', value: '3', color: '#FF6B6B' },
    { label: 'Agents Active',    value: isInvestigating ? '10' : '0', color: '#A8A2FF' },
    { label: 'Avg MTTR',         value: '4m 12s', color: '#4EDE9E' },
    { label: 'Alerts (24h)',     value: '17', color: '#FFB347' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0D0D0F]">
      {/* Top metrics bar */}
      <div className="grid grid-cols-4 border-b h-14 shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col justify-center px-6 border-r last:border-0" style={{ borderColor: 'var(--so-border)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--so-text-subtle)' }}>{m.label}</span>
            <span className="text-[15px] font-mono font-bold mt-0.5" style={{ color: m.color }}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Incident Feed */}
        <div className="w-[340px] shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--so-border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between h-12 shrink-0" style={{ borderColor: 'var(--so-border)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: 'var(--so-critical)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Active Stream
              </span>
            </div>
            <button 
              onClick={() => setIsWebhookOpen(true)}
              className="p-1.5 hover:bg-white/5 rounded-md transition-all text-white/40 hover:text-indigo-400 group relative"
              title="Connect Source"
            >
              <Globe size={14} />
              <span className="absolute right-0 top-0 w-2 h-2 bg-indigo-500 rounded-full border-2 border-[#0D0D0F] scale-0 group-hover:scale-100 transition-transform" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {INCIDENTS.map((inc, i) => (
              <motion.div
                key={inc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                className="px-4 py-4 border-b cursor-pointer group transition-colors"
                style={{ borderColor: 'var(--so-border)',
                         background: currentIncidentId === inc.id ? 'rgba(168,162,255,0.04)' : 'transparent' }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <SeverityBadge sev={inc.severity} />
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: statusConfig[inc.status].color }} />
                    <span className="text-[10px] font-medium" style={{ color: 'var(--so-text-muted)' }}>
                      {statusConfig[inc.status].label}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] font-medium leading-tight mb-2" style={{ color: 'var(--so-text)' }}>
                  {inc.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono opacity-60" style={{ color: 'var(--so-text-muted)' }}>
                    {inc.id} · {inc.service}
                  </span>
                  <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--so-text-subtle)' }}>
                    <Clock size={10} /> {inc.time}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
          
          <DemoControls 
            isInvestigating={isInvestigating} 
            onSimulate={(active) => {
              setElapsed(0);
              startInvestigation(active);
            }} 
          />
        </div>

        {/* MIDDLE: Agent Workflow & Operational View */}
        <div className="flex-1 min-w-0 flex flex-col border-r" style={{ borderColor: 'var(--so-border)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2 h-12 shrink-0" style={{ borderColor: 'var(--so-border)' }}>
            <GitBranch size={14} style={{ color: 'var(--so-primary)' }} />
            <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
              Operational Reasoning
            </span>
            {currentIncidentId && (
              <span className="ml-auto text-[11px] font-mono bg-white/[0.04] px-2 py-0.5 rounded" style={{ color: 'var(--so-text-muted)' }}>
                {currentIncidentId} {isInvestigating && `· ${elapsed}s`}
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            <AnimatePresence mode="wait">
              {!currentIncidentId ? (
                <motion.div key="idle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/[0.05]"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <Zap size={20} style={{ color: 'var(--so-text-subtle)' }} />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium" style={{ color: 'var(--so-text-muted)' }}>
                      Awaiting operational signal
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--so-text-subtle)' }}>
                      Start a simulation to activate the agent swarm
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="running"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-2 max-w-2xl mx-auto">
                  
                  {/* Confidence Evolution */}
                  <ConfidenceMeter value={confidenceScore} />

                  <div className="mb-6 px-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                      style={{ color: 'var(--so-text-subtle)' }}>Investigation Context</p>
                    <p className="text-[16px] font-semibold leading-snug" style={{ color: 'var(--so-text)' }}>
                      P99 Latency Spike in checkout-api
                    </p>
                  </div>

                  <PlannerTasks tasks={tasks} incidentType={incidentType} />

                  <div className="grid grid-cols-1 gap-1">
                    {/* Planner */}
                    {agentSteps.filter(s => s.id === 'planner').map((step, i) => (
                      <AgentStepRow key={step.id} step={step} idx={i} />
                    ))}

                    {/* Parallel Specialists Swarm */}
                    <div className="my-3 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-white/[0.05]" />
                      <div className="pl-2 space-y-1">
                        {agentSteps.filter(s => ['log', 'trace', 'deploy', 'memory'].includes(s.id)).map((step, i) => (
                          <AgentStepRow key={step.id} step={step} idx={i} />
                        ))}
                      </div>
                    </div>

                    {/* The rest of the workflow */}
                    {agentSteps.filter(s => !['planner', 'log', 'trace', 'deploy', 'memory'].includes(s.id)).map((step, i) => (
                      <AgentStepRow key={step.id} step={step} idx={i} />
                    ))}
                  </div>

                  {/* Convergence: Root Cause & Remediation */}
                  {(causalChain || remediation) && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 p-5 rounded-xl border relative overflow-hidden"
                      style={{ background: 'rgba(78,222,158,0.03)', borderColor: 'rgba(78,222,158,0.15)' }}
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 size={14} style={{ color: 'var(--so-stable)' }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: 'var(--so-stable)' }}>Root Cause Established</span>
                      </div>
                      
                      <div className="space-y-5">
                        {causalChain && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest mb-2 opacity-50" style={{ color: 'var(--so-text)' }}>Analysis</p>
                            <p className="text-[13px] leading-relaxed font-medium" style={{ color: 'var(--so-text)' }}>
                              {causalChain}
                            </p>
                          </div>
                        )}
                        
                        {remediation && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest mb-2 opacity-50" 
                               style={{ color: requiresApproval ? 'var(--so-warn)' : 'var(--so-stable)' }}>
                              {requiresApproval ? 'Remediation (Requires Approval)' : 'Autonomous Remediation'}
                            </p>
                            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                               <Zap size={13} className="mt-0.5 text-emerald-400" />
                               <p className="text-[12px] font-semibold text-emerald-100">{remediation}</p>
                            </div>

                            {requiresApproval ? (
                              <div className="mt-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                                <div className="flex items-center gap-3 mb-4">
                                  <AlertTriangle size={18} className="text-amber-400" />
                                  <div>
                                    <p className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Bounded Autonomy Triggered</p>
                                    <p className="text-[11px] text-amber-200/70">Confidence threshold (50%) not met. Awaiting operator validation.</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button className="flex-1 py-2 rounded-lg bg-amber-500 text-black text-[11px] font-bold uppercase tracking-wider hover:bg-amber-400 transition-colors">
                                    Approve & Execute
                                  </button>
                                  <button className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors">
                                    Refine Plan
                                  </button>
                                </div>
                              </div>
                            ) : remediationCommand && (
                              <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/5">
                                <div className="flex items-center gap-2 mb-2">
                                  <Terminal size={11} className="text-emerald-400" />
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">Self-Patching Executed</span>
                                </div>
                                <div className="font-mono text-[11px] text-emerald-200">
                                  $ {remediationCommand}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-5 border-t flex items-center gap-4" style={{ borderColor: 'rgba(78,222,158,0.1)' }}>
                        <button
                          onClick={() => onNavigate?.('artifacts')}
                          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors">
                          View Artifacts <ArrowUpRight size={12} />
                        </button>
                        {currentIncidentId && (
                          <a
                            href={`${API_BASE_URL}/report/${currentIncidentId}/download`}
                            download
                            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <Download size={12} /> Download RCA
                          </a>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Causal Timeline */}
                  <TimelineReconstruction events={incidentTimeline} />

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT: Live Stream & Runtime Memory */}
        <div className="w-[340px] shrink-0 flex flex-col border-l" style={{ borderColor: 'var(--so-border)' }}>
          <div className="flex-1 min-h-0 border-b" style={{ borderColor: 'var(--so-border)' }}>
            <LiveActivityStream />
          </div>
          <div className="flex-1 min-h-0 border-b" style={{ borderColor: 'var(--so-border)' }}>
            <RuntimeEventStream />
          </div>
          <div className="flex-1 min-h-0">
            <RuntimeMemoryPanel />
          </div>
        </div>

      </div>

      <WebhookIntegrationPanel 
        isOpen={isWebhookOpen} 
        onClose={() => setIsWebhookOpen(false)} 
      />
    </div>
  );
}
