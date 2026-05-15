'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, GitBranch, Activity, Zap,
  Clock, Play, CheckCircle2,
  Circle, RefreshCw, XCircle, ArrowUpRight, Download
} from 'lucide-react';
import { useIncidentStore, type AgentStep, API_BASE_URL } from '@/store/useIncidentStore';

// --- Types ---
type Severity = 'critical' | 'high' | 'medium';
interface Incident {
  id: string; title: string; service: string;
  severity: Severity; time: string; status: 'investigating' | 'stable' | 'resolved';
}
interface ActivityEntry { time: string; text: string; type: 'info' | 'warn' | 'success' | 'error'; }

// --- Static mock data ---
const INCIDENTS: Incident[] = [
  { id: 'INC-8291', title: 'P99 Latency Spike in billing-service', service: 'billing-svc', severity: 'critical', time: '2m ago', status: 'investigating' },
  { id: 'INC-8290', title: 'Auth token validation failures', service: 'auth-svc',    severity: 'high',     time: '14m ago', status: 'stable' },
  { id: 'INC-8289', title: 'Background job queue depth elevated', service: 'worker-svc', severity: 'medium', time: '31m ago', status: 'resolved' },
];
const ACTIVITY: ActivityEntry[] = [
  { time: '14:08', text: 'INC-8291 — Webhook received from Datadog', type: 'warn' },
  { time: '14:08', text: 'Planner Agent activated for INC-8291', type: 'info' },
  { time: '14:07', text: 'INC-8290 — Auth service recovered, latency nominal', type: 'success' },
  { time: '13:55', text: 'Deployment v2.14.1 rolled out to billing-service', type: 'info' },
  { time: '13:42', text: 'INC-8289 — Worker queue depth normalised', type: 'success' },
  { time: '13:20', text: 'Trace Agent flagged span anomaly in checkout flow', type: 'warn' },
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
    pending:   <Circle size={13} style={{ color: 'var(--so-text-subtle)' }} />,
    running:   <RefreshCw size={13} className="animate-spin" style={{ color: 'var(--so-primary)' }} />,
    completed: <CheckCircle2 size={13} style={{ color: 'var(--so-stable)' }} />,
    failed:    <XCircle size={13} style={{ color: 'var(--so-critical)' }} />
  };
  const isRunning = step.status === 'running';
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.06 }}
      className="flex items-start gap-3 py-2.5 px-3 rounded-md transition-colors"
      style={{ background: isRunning ? 'rgba(168,162,255,0.06)' : 'transparent',
               border: isRunning ? '1px solid rgba(168,162,255,0.15)' : '1px solid transparent' }}
    >
      <span className="mt-0.5 shrink-0">{icons[step.status]}</span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[12px] font-medium"
          style={{ color: step.status === 'completed' ? 'var(--so-text)' : step.status === 'running' ? 'var(--so-primary)' : 'var(--so-text-muted)' }}>
          {step.name}
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

// --- Main Component ---
export default function CommandCenter({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { isInvestigating, currentIncidentId, agentSteps, activityLog, causalChain,
          startInvestigation } = useIncidentStore();
  const [elapsed, setElapsed] = useState(0);

  // Tick elapsed
  useEffect(() => {
    if (!isInvestigating) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isInvestigating]);

  const handleSimulate = () => {
    setElapsed(0);
    startInvestigation();
  };
  const liveEntries = activityLog.length > 0 ? activityLog : ACTIVITY;

  // Metrics bar
  const metrics = [
    { label: 'Active Incidents', value: '3', color: '#FF6B6B' },
    { label: 'Agents Running',   value: isInvestigating ? '4' : '0', color: '#A8A2FF' },
    { label: 'MTTR Today',       value: '4m 12s', color: '#4EDE9E' },
    { label: 'Alerts (24h)',     value: '17', color: '#FFB347' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--so-border)' }}>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>
            Command Center
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-muted)' }}>
            Autonomous incident intelligence — real-time
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSimulate}
          disabled={isInvestigating}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold transition-all disabled:opacity-50"
          style={{
            background: isInvestigating ? 'rgba(168,162,255,0.12)' : '#A8A2FF',
            color: isInvestigating ? '#A8A2FF' : '#0B0B0C',
            boxShadow: isInvestigating ? 'none' : '0 0 20px rgba(168,162,255,0.35)',
          }}
        >
          {isInvestigating
            ? <><RefreshCw size={14} className="animate-spin" /> Investigating…</>
            : <><Play size={14} /> Simulate Incident</>
          }
        </motion.button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px border-b shrink-0"
        style={{ borderColor: 'var(--so-border)', background: 'var(--so-border)' }}>
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1 px-5 py-3.5" style={{ background: 'var(--so-surface)' }}>
            <span className="text-[11px] font-medium" style={{ color: 'var(--so-text-muted)' }}>{m.label}</span>
            <span className="text-[22px] font-bold leading-none" style={{ color: m.color }}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Incident Feed */}
        <div className="w-[340px] shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--so-border)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--so-border)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--so-critical)' }} />
            <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
              Active Incidents
            </span>
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>3</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {INCIDENTS.map((inc, i) => (
              <motion.div
                key={inc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                className="px-4 py-3.5 border-b cursor-pointer group"
                style={{ borderColor: 'var(--so-border)',
                         background: currentIncidentId === inc.id ? 'rgba(168,162,255,0.06)' : 'transparent' }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <SeverityBadge sev={inc.severity} />
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: statusConfig[inc.status].color }} />
                    <span className="text-[10px]" style={{ color: 'var(--so-text-muted)' }}>
                      {statusConfig[inc.status].label}
                    </span>
                  </div>
                </div>
                <p className="text-[12px] font-medium leading-snug mb-1" style={{ color: 'var(--so-text)' }}>
                  {inc.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono" style={{ color: 'var(--so-text-muted)' }}>
                    {inc.id} · {inc.service}
                  </span>
                  <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--so-text-subtle)' }}>
                    <Clock size={9} /> {inc.time}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* MIDDLE: Agent Workflow */}
        <div className="flex-1 min-w-0 flex flex-col border-r" style={{ borderColor: 'var(--so-border)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--so-border)' }}>
            <GitBranch size={14} style={{ color: 'var(--so-primary)' }} />
            <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
              Agent Workflow
            </span>
            {currentIncidentId && (
              <span className="ml-auto text-[11px] font-mono" style={{ color: 'var(--so-text-muted)' }}>
                {currentIncidentId} {isInvestigating && `· ${elapsed}s`}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait">
              {!currentIncidentId ? (
                <motion.div key="idle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--so-surface-2, #1C1C1F)' }}>
                    <Zap size={18} style={{ color: 'var(--so-text-muted)' }} />
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
                    No active investigation
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>
                    Click Simulate Incident to begin
                  </p>
                </motion.div>
              ) : (
                <motion.div key="running"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-1">
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: 'var(--so-text-subtle)' }}>Investigating</p>
                    <p className="text-[14px] font-medium" style={{ color: 'var(--so-text)' }}>
                      P99 Latency Spike in billing-service
                    </p>
                  </div>
                  {agentSteps.map((step, i) => (
                    <AgentStepRow key={step.id} step={step} idx={i} />
                  ))}
                  {causalChain && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mt-4 p-3 rounded-md border"
                      style={{ background: 'rgba(78,222,158,0.06)', borderColor: 'rgba(78,222,158,0.2)' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 size={13} style={{ color: 'var(--so-stable)' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-widest"
                          style={{ color: 'var(--so-stable)' }}>Investigation Complete</span>
                      </div>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--so-text-muted)' }}>
                        {causalChain}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => onNavigate?.('artifacts')}
                          className="flex items-center gap-1.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                          style={{ color: 'var(--so-primary)' }}>
                          View Artifacts <ArrowUpRight size={11} />
                        </button>
                        {currentIncidentId && (
                          <a
                            href={`${API_BASE_URL}/report/${currentIncidentId}/download`}
                            download
                            className="flex items-center gap-1.5 text-[11px] font-medium"
                            style={{ color: 'var(--so-stable)' }}
                          >
                            <Download size={11} /> Download RCA
                          </a>
                        )}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT: Live Stream */}
        <div className="w-[280px] shrink-0 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--so-border)' }}>
            <Activity size={14} style={{ color: 'var(--so-info)' }} />
            <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
              Live Stream
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {liveEntries.map((entry, i) => {
              const typeColors = { info: 'var(--so-info)', warn: 'var(--so-warn)', success: 'var(--so-stable)', error: 'var(--so-critical)' };
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--so-text-subtle)' }}>
                    {entry.time}
                  </span>
                  <div className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                    style={{ background: typeColors[entry.type] }} />
                  <span className="text-[11px] leading-relaxed" style={{ color: 'var(--so-text-muted)' }}>
                    {entry.text}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
