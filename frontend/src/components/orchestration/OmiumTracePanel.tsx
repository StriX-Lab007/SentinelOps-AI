'use client';

import React from 'react';
import { ExternalLink, ShieldCheck, GitBranch } from 'lucide-react';
import { useIncidentStore, type TraceSpan } from '@/store/useIncidentStore';

function TraceNode({ span, spans, depth }: { span: TraceSpan; spans: TraceSpan[]; depth: number }) {
  const children = spans.filter((s) => s.parent === span.name);
  return (
    <div style={{ paddingLeft: depth * 14 }}>
      <div className="flex items-start gap-2 py-1">
        <GitBranch size={11} style={{ color: 'var(--so-primary)', marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium" style={{ color: 'var(--so-text)' }}>{span.name}</div>
          {span.output && (
            <div className="text-[10px] truncate" style={{ color: 'var(--so-text-muted)' }}>{span.output}</div>
          )}
        </div>
        <span className="text-[9px] uppercase shrink-0" style={{ color: span.status === 'completed' ? 'var(--so-stable)' : 'var(--so-warn)' }}>
          {span.status}
        </span>
      </div>
      {children.map((c) => (
        <TraceNode key={`${c.name}-${c.timestamp}`} span={c} spans={spans} depth={depth + 1} />
      ))}
    </div>
  );
}

function buildTree(spans: TraceSpan[]) {
  const names = new Set(spans.map((s) => s.name));
  const roots = spans.filter((s) => !s.parent || !names.has(s.parent));
  return roots.map((r) => (
    <TraceNode key={`${r.name}-${r.timestamp}`} span={r} spans={spans} depth={0} />
  ));
}

export default function OmiumTracePanel() {
  const { omiumEnabled, omiumDashboardUrl, omiumExecutionId, traceSpans, currentIncidentId, checkpointEvents } =
    useIncidentStore();

  if (!currentIncidentId) return null;

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: 'var(--so-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--so-text-muted)' }}>
          <ShieldCheck size={13} style={{ color: omiumEnabled ? 'var(--so-stable)' : 'var(--so-text-subtle)' }} />
          Omium Verification
        </div>
        {omiumDashboardUrl && (
          <a
            href={omiumDashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors hover:bg-white/5"
            style={{ color: 'var(--so-primary)' }}
          >
            Open trace <ExternalLink size={10} />
          </a>
        )}
      </div>

      {omiumEnabled ? (
        <p className="text-[10px] mb-2 font-mono" style={{ color: 'var(--so-text-subtle)' }}>
          execution_id={omiumExecutionId ?? currentIncidentId}
        </p>
      ) : (
        <p className="text-[10px] mb-2" style={{ color: 'var(--so-text-muted)' }}>
          Set OMIUM_API_KEY to emit verified traces to app.omium.ai
        </p>
      )}

      {checkpointEvents.length > 0 && (
        <div className="mb-2 space-y-1 max-h-[72px] overflow-y-auto">
          {checkpointEvents.map((ck, i) => (
            <div key={i} className="text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(78,222,158,0.06)', border: '1px solid rgba(78,222,158,0.15)' }}>
              <span style={{ color: 'var(--so-stable)' }}>{ck.action}</span>
              <span className="font-mono ml-1" style={{ color: 'var(--so-text-muted)' }}>{ck.name}</span>
              {ck.replay_url && (
                <a href={ck.replay_url} target="_blank" rel="noreferrer" className="ml-2 underline" style={{ color: 'var(--so-primary)' }}>
                  replay
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="max-h-[140px] overflow-y-auto rounded-md p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--so-border)' }}>
        {traceSpans.length > 0 ? buildTree(traceSpans) : (
          <p className="text-[10px] text-center py-2" style={{ color: 'var(--so-text-subtle)' }}>
            Trace hierarchy appears as agents run
          </p>
        )}
      </div>
    </div>
  );
}
