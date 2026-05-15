'use client';

import React from 'react';
import { ExternalLink, Cpu, ShieldCheck, RefreshCw } from 'lucide-react';
import { useIncidentStore } from '@/store/useIncidentStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

export default function AgentsView() {
  const {
    currentIncidentId,
    isInvestigating,
    omiumEnabled,
    omiumDashboardUrl,
    omiumExecutionId,
    agentSteps,
    checkpointEvents,
  } = useIncidentStore();

  const embedUrl = omiumDashboardUrl ?? null;
  const completedAgents = agentSteps.filter((s) => s.status === 'completed').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>
            Agents
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--so-text-muted)' }}>
            Machine execution proof via Omium — mirrors the orchestration graph
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <span style={{ color: 'var(--so-text-muted)' }}>
            <Cpu size={13} className="inline mr-1 -mt-0.5" />
            {completedAgents}/{agentSteps.length} complete
          </span>
          {isInvestigating && (
            <span className="flex items-center gap-1" style={{ color: 'var(--so-primary)' }}>
              <RefreshCw size={12} className="animate-spin" /> Live
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[240px] shrink-0 border-r p-4 space-y-2 overflow-y-auto" style={{ borderColor: 'var(--so-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--so-text-muted)' }}>
            Agent roster
          </p>
          {agentSteps.map((step) => (
            <div
              key={step.id}
              className="flex items-center justify-between px-2.5 py-2 rounded-md text-[11px]"
              style={{
                background: step.status === 'running' ? 'rgba(168,162,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: '1px solid var(--so-border)',
              }}
            >
              <span style={{ color: step.status === 'completed' ? 'var(--so-text)' : 'var(--so-text-muted)' }}>
                {step.name}
              </span>
              <span
                className="text-[9px] uppercase font-bold"
                style={{
                  color:
                    step.status === 'completed'
                      ? 'var(--so-stable)'
                      : step.status === 'running'
                        ? 'var(--so-primary)'
                        : 'var(--so-text-subtle)',
                }}
              >
                {step.status}
              </span>
            </div>
          ))}

          {checkpointEvents.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest mt-4 mb-2" style={{ color: 'var(--so-text-muted)' }}>
                Checkpoints
              </p>
              {checkpointEvents.map((ck, i) => (
                <div key={i} className="p-2 rounded-md text-[10px]" style={{ border: '1px solid var(--so-border)' }}>
                  <div className="font-mono" style={{ color: 'var(--so-primary)' }}>{ck.name}</div>
                  <div style={{ color: 'var(--so-text-muted)' }}>{ck.action}</div>
                  {ck.replay_url && (
                    <a href={ck.replay_url} target="_blank" rel="noopener noreferrer" className="underline mt-1 inline-block" style={{ color: 'var(--so-info)' }}>
                      Replay
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!currentIncidentId ? (
            <div className="flex flex-1 items-center justify-center flex-col gap-3 p-8 text-center">
              <Cpu size={36} style={{ color: 'var(--so-text-subtle)', opacity: 0.4 }} />
              <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
                Run a simulation from Command Center to view verified agent traces
              </p>
            </div>
          ) : embedUrl ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--so-border)' }}>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: omiumEnabled ? 'var(--so-stable)' : 'var(--so-warn)' }}>
                  <ShieldCheck size={14} />
                  <span>
                    {omiumEnabled ? 'Omium verified' : 'Omium offline'} · {omiumExecutionId ?? currentIncidentId}
                  </span>
                </div>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: 'var(--so-primary)' }}
                >
                  Open full dashboard <ExternalLink size={12} />
                </a>
              </div>
              <iframe
                title="Omium execution trace"
                src={embedUrl}
                className="flex-1 w-full border-0 min-h-0"
                style={{ background: '#0B0B0C' }}
              />
              <p className="text-[10px] px-4 py-2 shrink-0" style={{ color: 'var(--so-text-subtle)' }}>
                If the embed is blank, use Open full dashboard. Status:{' '}
                <a href={`${API_BASE_URL}/omium/status`} target="_blank" rel="noreferrer" className="underline">
                  /omium/status
                </a>
              </p>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center flex-col gap-3 p-8 text-center">
              <ShieldCheck size={36} style={{ color: 'var(--so-text-subtle)', opacity: 0.4 }} />
              <p className="text-[13px]" style={{ color: 'var(--so-text-muted)' }}>
                Set OMIUM_API_KEY on the backend to enable the execution embed
              </p>
              <p className="text-[11px] font-mono" style={{ color: 'var(--so-text-subtle)' }}>
                execution_id={currentIncidentId}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
