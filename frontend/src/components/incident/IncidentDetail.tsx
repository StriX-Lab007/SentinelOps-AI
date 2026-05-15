'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, GitBranch, FileText, Zap, ChevronRight, Code } from 'lucide-react';
import { useIncidentStore } from '@/store/useIncidentStore';

type TabId = 'timeline' | 'causal' | 'logs' | 'traces' | 'remediation';

const TABS: { id: TabId; label: string }[] = [
  { id: 'timeline',    label: 'Timeline' },
  { id: 'causal',      label: 'Causal Chain' },
  { id: 'logs',        label: 'Logs' },
  { id: 'traces',      label: 'Traces' },
  { id: 'remediation', label: 'Remediation' },
];

const TIMELINE = [
  { time: '14:02:11', event: 'Deployment v2.14.0 rolled out to billing-service', type: 'deploy' as const },
  { time: '14:05:03', event: 'DB connection count spikes from 45 → 500 (Pool Max)', type: 'warn' as const },
  { time: '14:07:28', event: 'P99 latency exceeds 2.4s — Datadog alert fires', type: 'critical' as const },
  { time: '14:08:01', event: 'SentinelOps webhook received — triage initiated', type: 'info' as const },
  { time: '14:08:39', event: 'Planner Agent generated execution plan', type: 'info' as const },
  { time: '14:09:42', event: 'Log, Trace & Deploy Agents dispatched in parallel', type: 'info' as const },
  { time: '14:11:20', event: 'Correlation Agent established causal chain (92% confidence)', type: 'success' as const },
  { time: '14:12:05', event: 'Remediation Agent recommended rollback to v2.13.9', type: 'success' as const },
];

const LOG_LINES = [
  { time: '14:07:21', level: 'ERROR', msg: 'Cannot get a connection, pool error Timeout waiting for connection from pool' },
  { time: '14:07:20', level: 'ERROR', msg: 'HikariPool-1 - Connection is not available, request timed out after 30006ms' },
  { time: '14:07:15', level: 'WARN',  msg: 'HikariPool-1 - Connection pool utilization: 98%' },
  { time: '14:05:02', level: 'DEBUG', msg: 'verifyTransaction() invoked — db connection acquired but not released' },
  { time: '14:02:14', level: 'INFO',  msg: 'Application started with config: db_pool_size=500, deploy_version=v2.14.0' },
];

const SPANS = [
  { name: 'POST /api/checkout',         duration: '2412ms', service: 'gateway', anomaly: true },
  { name: 'billing-service.verify',     duration: '2380ms', service: 'billing', anomaly: true },
  { name: 'db.query.verifyTransaction', duration: '2350ms', service: 'billing', anomaly: true },
  { name: 'redis.get.session',          duration: '3ms',    service: 'billing', anomaly: false },
  { name: 'payment-service.charge',     duration: '18ms',   service: 'payment', anomaly: false },
];

const typeColors = {
  deploy:   { dot: '#7B9EFF', label: 'Deploy' },
  warn:     { dot: '#FFB347', label: 'Warning' },
  critical: { dot: '#FF6B6B', label: 'Critical' },
  info:     { dot: '#A8A2FF', label: 'Info' },
  success:  { dot: '#4EDE9E', label: 'Success' },
};

const logLevelColor: Record<string, string> = { ERROR: '#FF6B6B', WARN: '#FFB347', INFO: '#7B9EFF', DEBUG: '#4A4759' };

export default function IncidentDetail() {
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const { currentIncidentId, causalChain, remediation } = useIncidentStore();

  if (!currentIncidentId) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <AlertTriangle size={32} style={{ color: 'var(--so-text-subtle)', opacity: 0.4 }} />
        <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>No active incident</p>
        <p className="text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>Simulate one from the Command Center</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>CRITICAL</span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--so-text-muted)' }}>INC-8291</span>
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>
              P99 Latency Spike in billing-service
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--so-text-muted)' }}>
              billing-svc · 14:07 UTC · Investigated autonomously
            </p>
          </div>
          {causalChain && (
            <div className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md shrink-0"
              style={{ background: 'rgba(78,222,158,0.1)', border: '1px solid rgba(78,222,158,0.3)', color: 'var(--so-stable)' }}>
              <CheckCircle2 size={12} /> Root cause found
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-6 gap-1 shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-3 py-3 text-[12px] font-medium transition-colors"
            style={{ color: activeTab === tab.id ? 'var(--so-text)' : 'var(--so-text-muted)' }}>
            {tab.label}
            {activeTab === tab.id && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
                style={{ background: 'var(--so-primary)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>

            {activeTab === 'timeline' && (
              <div className="space-y-1 max-w-2xl">
                {TIMELINE.map((ev, i) => {
                  const cfg = typeColors[ev.type];
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-4 py-2.5 pl-3 pr-4 rounded-md hover:bg-white/[0.02]"
                      style={{ borderLeft: `2px solid ${cfg.dot}20` }}>
                      <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: cfg.dot }} />
                      <span className="text-[11px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--so-text-subtle)' }}>{ev.time}</span>
                      <span className="text-[12px] leading-relaxed" style={{ color: 'var(--so-text-muted)' }}>{ev.event}</span>
                      <span className="ml-auto text-[10px] font-bold shrink-0 mt-0.5" style={{ color: cfg.dot }}>{cfg.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {activeTab === 'causal' && (
              <div className="max-w-2xl space-y-4">
                <div className="p-4 rounded-lg" style={{ background: 'rgba(168,162,255,0.06)', border: '1px solid rgba(168,162,255,0.2)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch size={14} style={{ color: 'var(--so-primary)' }} />
                    <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-primary)' }}>Causal Chain</span>
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--so-stable)' }}>92% confidence</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-mono">
                    {['Commit 8f92a1c', 'verifyTransaction()', 'Pool Exhaustion', 'Query Timeout', 'Latency > 2.4s'].map((step, i, arr) => (
                      <React.Fragment key={step}>
                        <span className="px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--so-text)' }}>{step}</span>
                        {i < arr.length - 1 && <ChevronRight size={12} style={{ color: 'var(--so-text-subtle)' }} />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                {causalChain && (
                  <div className="p-4 rounded-lg text-[13px] leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--so-border)', color: 'var(--so-text-muted)' }}>
                    {causalChain}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="max-w-3xl space-y-1">
                <div className="mb-3 text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>
                  Showing 5 most relevant log lines from billing-service
                </div>
                {LOG_LINES.map((line, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 p-2.5 rounded-md font-mono text-[11px]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--so-text-subtle)', flexShrink: 0 }}>{line.time}</span>
                    <span className="font-bold shrink-0 w-12" style={{ color: logLevelColor[line.level] }}>{line.level}</span>
                    <span style={{ color: 'var(--so-text-muted)' }}>{line.msg}</span>
                  </motion.div>
                ))}
              </div>
            )}

            {activeTab === 'traces' && (
              <div className="max-w-3xl space-y-2">
                <div className="mb-3 text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>
                  Distributed trace — INC-8291 · Request span anomalies highlighted
                </div>
                {SPANS.map((span, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-md"
                    style={{ background: span.anomaly ? 'rgba(255,107,107,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${span.anomaly ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.04)'}` }}>
                    <Code size={12} style={{ color: span.anomaly ? 'var(--so-critical)' : 'var(--so-text-subtle)', flexShrink: 0 }} />
                    <span className="flex-1 text-[12px] font-mono" style={{ color: 'var(--so-text)' }}>{span.name}</span>
                    <span className="text-[11px]" style={{ color: 'var(--so-text-muted)' }}>{span.service}</span>
                    <span className="text-[12px] font-bold" style={{ color: span.anomaly ? 'var(--so-critical)' : 'var(--so-stable)' }}>{span.duration}</span>
                    {span.anomaly && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>SLOW</span>}
                  </motion.div>
                ))}
              </div>
            )}

            {activeTab === 'remediation' && (
              <div className="max-w-2xl space-y-4">
                <div className="p-4 rounded-lg" style={{ background: 'rgba(78,222,158,0.06)', border: '1px solid rgba(78,222,158,0.25)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={14} style={{ color: 'var(--so-stable)' }} />
                    <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-stable)' }}>Recommended Action</span>
                  </div>
                  <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--so-text-muted)' }}>
                    {remediation || 'Rollback billing-service to v2.13.9. Execute automated script to undo the connection leak deployment.'}
                  </p>
                  <div className="p-3 rounded-md font-mono text-[12px] mb-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(78,222,158,0.15)', color: 'var(--so-stable)' }}>
                    $ kubectl rollout undo deployment/billing-service
                  </div>
                  <button className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
                    style={{ background: 'var(--so-stable)', color: '#0B0B0C', boxShadow: '0 0 20px rgba(78,222,158,0.3)' }}>
                    Execute Rollback Plan
                  </button>
                </div>
                <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--so-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={13} style={{ color: 'var(--so-text-muted)' }} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-muted)' }}>Confidence Reasoning</span>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--so-text-muted)' }}>
                    Correlation Agent matched patterns from INC-7042 (94% historical similarity). Log and trace evidence
                    conclusively points to a connection pool exhaustion triggered by the deployment change. Confidence: 92%.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
