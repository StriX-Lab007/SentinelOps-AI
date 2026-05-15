'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Activity, TrendingUp, Clock, Zap, Link as LinkIcon,
  CheckCircle2, Circle, RefreshCw
} from 'lucide-react';
import { useIncidentStore, type TimelineEvent } from '@/store/useIncidentStore';
import LiveActivityStream from '@/components/shared/LiveActivityStream';
import OrchestrationView from '@/components/orchestration/OrchestrationView';

interface ConfidenceDataPoint {
  time: string;
  value: number;
}

export default function IncidentReplayDashboard() {
  const {
    isInvestigating,
    currentIncidentId,
    agentSteps,
    activityLog,
    causalChain,
    remediation,
    incidentTimeline,
    confidenceScore,
    traceSpans,
  } = useIncidentStore();

  const [confidenceHistory, setConfidenceHistory] = useState<ConfidenceDataPoint[]>([]);
  const lastConfidenceRef = React.useRef<number | null>(null);

  // Track confidence evolution
  useEffect(() => {
    if (confidenceScore !== null && isInvestigating && confidenceScore !== lastConfidenceRef.current) {
      lastConfidenceRef.current = confidenceScore;
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setConfidenceHistory((prev) => {
        const existing = prev.find((p) => p.time === time);
        if (existing) {
          return prev.map((p) =>
            p.time === time ? { ...p, value: confidenceScore } : p
          );
        }
        return [...prev, { time, value: confidenceScore }];
      });
    }
  }, [confidenceScore, isInvestigating]);

  const confidencePercent = confidenceScore
    ? Math.round(confidenceScore * 100)
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--so-border)' }}>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>
            Replay Production Incident
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-muted)' }}>
            {currentIncidentId ? `Incident ${currentIncidentId} · Real-time autonomous investigation` : 'Select an incident to begin'}
          </p>
        </div>
        {currentIncidentId && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md"
            style={{ background: 'rgba(168,162,255,0.08)', border: '1px solid rgba(168,162,255,0.15)' }}>
            <Circle size={8} className="fill-current" style={{ color: 'var(--so-primary)' }} />
            <span className="text-[12px] font-medium" style={{ color: 'var(--so-text)' }}>
              Investigation Active
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Left & Right */}
      <div className="flex flex-1 min-h-0 overflow-hidden gap-px"
        style={{ background: 'var(--so-border)' }}>

        {/* LEFT COLUMN: System Structure */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: 'var(--so-surface)' }}>

          {/* Incident Feed */}
          <div className="flex-1 min-h-0 flex flex-col border-b overflow-hidden"
            style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <AlertTriangle size={14} style={{ color: 'var(--so-critical)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Incident Details
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                {!currentIncidentId ? (
                  <motion.div key="idle"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full gap-3">
                    <Zap size={24} style={{ color: 'var(--so-text-muted)' }} />
                    <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
                      No active incident
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="active"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: 'var(--so-text-subtle)' }}>Service</p>
                      <p className="text-[14px] font-medium" style={{ color: 'var(--so-text)' }}>
                        checkout-api
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: 'var(--so-text-subtle)' }}>Incident Type</p>
                      <p className="text-[14px] font-medium" style={{ color: 'var(--so-text)' }}>
                        P99 Latency Spike
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: 'var(--so-text-subtle)' }}>Severity</p>
                      <span className="text-[12px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full inline-block"
                        style={{ color: '#FF6B6B', background: 'rgba(255,107,107,0.12)' }}>
                        CRITICAL
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Orchestration Graph */}
          <div className="flex-1 min-h-0 flex flex-col border-b overflow-hidden"
            style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <Zap size={14} style={{ color: 'var(--so-primary)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Orchestration Graph
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              {currentIncidentId ? (
                <OrchestrationView />
              ) : (
                <div className="h-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.15)' }}>
                  <p className="text-[12px]" style={{ color: 'var(--so-text-muted)' }}>
                    Orchestration graph will appear here
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Root Cause & Remediation */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--so-stable)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Root Cause & Remediation
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                {!causalChain ? (
                  <motion.div key="pending"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--so-primary)' }} />
                    <span className="text-[12px]" style={{ color: 'var(--so-text-muted)' }}>
                      Investigating root cause...
                    </span>
                  </motion.div>
                ) : (
                  <motion.div key="complete"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="space-y-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                        style={{ color: 'var(--so-text-subtle)' }}>Root Cause</p>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--so-text)' }}>
                        {causalChain}
                      </p>
                    </div>
                    {remediation && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                          style={{ color: 'var(--so-text-subtle)' }}>Remediation</p>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--so-text)' }}>
                          {remediation}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: System Cognition Unfolding */}
        <div className="w-[420px] shrink-0 flex flex-col overflow-hidden" style={{ background: 'var(--so-surface)' }}>

          {/* Live Activity Stream */}
          <div className="flex-1 min-h-0 flex flex-col border-b overflow-hidden"
            style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <Activity size={14} style={{ color: 'var(--so-primary)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Live Activity Stream
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <LiveActivityStream />
            </div>
          </div>

          {/* Confidence Evolution */}
          <div className="h-32 flex flex-col border-b overflow-hidden shrink-0"
            style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <TrendingUp size={14} style={{ color: 'var(--so-stable)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Confidence Evolution
              </span>
              <span className="ml-auto text-[14px] font-bold" style={{ color: 'var(--so-stable)' }}>
                {confidencePercent}%
              </span>
            </div>
            <div className="flex-1 flex items-end gap-1 px-6 py-4">
              {confidenceHistory.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--so-text-muted)' }}>
                    Confidence building...
                  </p>
                </div>
              ) : (
                confidenceHistory.map((point, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${point.value * 100}%` }}
                    className="flex-1 rounded-t-sm transition-colors"
                    style={{ background: `rgba(78,222,158,${0.3 + point.value * 0.7})` }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Incident Timeline */}
          <div className="flex-1 min-h-0 flex flex-col border-b overflow-hidden"
            style={{ borderColor: 'var(--so-border)' }}>
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <Clock size={14} style={{ color: 'var(--so-text-muted)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Incident Timeline
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                {incidentTimeline.length === 0 ? (
                  <motion.div key="empty"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-[11px]" style={{ color: 'var(--so-text-muted)' }}>
                    Timeline events will appear here
                  </motion.div>
                ) : (
                  <motion.div key="timeline"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="space-y-3">
                    {incidentTimeline.map((event, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex gap-3">
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <Circle size={8} className="fill-current mt-1"
                            style={{ color: 'var(--so-text-muted)' }} />
                          <div className="w-0.5 h-8 rounded-full"
                            style={{ background: 'var(--so-border)' }} />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-[11px] font-medium" style={{ color: 'var(--so-text)' }}>
                            {event.event}
                          </p>
                          <p className="text-[10px] mt-1" style={{ color: 'var(--so-text-muted)' }}>
                            {event.time}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Live Integrations */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
              style={{ borderColor: 'var(--so-border)' }}>
              <LinkIcon size={14} style={{ color: 'var(--so-primary)' }} />
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
                Live Integrations
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {[
                  { name: 'Slack', status: 'connected', icon: '💬' },
                  { name: 'GitHub', status: 'connected', icon: '🔗' },
                  { name: 'PagerDuty', status: 'active', icon: '🔔' },
                  { name: 'Datadog', status: 'syncing', icon: '📊' },
                ].map((integration) => (
                  <motion.div
                    key={integration.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 rounded-md"
                    style={{ background: 'rgba(168,162,255,0.06)', border: '1px solid rgba(168,162,255,0.12)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">{integration.icon}</span>
                      <span className="text-[12px] font-medium" style={{ color: 'var(--so-text)' }}>
                        {integration.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                      style={{
                        color: '#4EDE9E',
                        background: 'rgba(78,222,158,0.15)',
                      }}>
                      {integration.status}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
