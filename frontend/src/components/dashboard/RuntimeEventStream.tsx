import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIncidentStore } from '@/store/useIncidentStore';
import { AlertCircle, CheckCircle2, RotateCcw, Activity, ShieldAlert, AlertTriangle } from 'lucide-react';

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'CRITICAL': return 'var(--so-critical)';
    case 'ERROR': return 'var(--so-error)';
    case 'WARN': return 'var(--so-warn)';
    case 'INFO': return 'var(--so-info)';
    default: return 'var(--so-text-subtle)';
  }
};

const getEventIcon = (type: string, severity: string) => {
  if (type.includes('FAILED') || severity === 'ERROR') return <AlertCircle size={12} />;
  if (type.includes('COMPLETED') || type.includes('SUCCESS')) return <CheckCircle2 size={12} />;
  if (type.includes('RECOVERY') || type.includes('RETRY')) return <RotateCcw size={12} />;
  if (type.includes('INTERVENTION') || severity === 'CRITICAL') return <ShieldAlert size={12} />;
  if (severity === 'WARN') return <AlertTriangle size={12} />;
  return <Activity size={12} />;
};

export default function RuntimeEventStream() {
  const { runtimeEvents } = useIncidentStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [runtimeEvents]);

  if (runtimeEvents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-white/30">
        <Activity size={24} className="mb-2 opacity-50" />
        <p className="text-[12px] font-medium">Awaiting runtime telemetry</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0D0D0F] border-t border-white/5">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-indigo-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Live Event Stream</span>
        </div>
        <span className="text-[9px] font-mono text-indigo-400/70">{runtimeEvents.length} events</span>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
        <AnimatePresence initial={false}>
          {runtimeEvents.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="px-3 py-2.5 rounded-lg border bg-white/[0.02] relative overflow-hidden group"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: getSeverityColor(ev.severity) }} />
              
              <div className="flex items-start justify-between gap-3 mb-1.5 pl-1">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: getSeverityColor(ev.severity) }}>
                    {getEventIcon(ev.type, ev.severity)}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: getSeverityColor(ev.severity) }}>
                    {ev.type.replace(/_/g, ' ')}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/40 shrink-0">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                </span>
              </div>
              
              <div className="pl-1 flex items-center justify-between">
                <span className="text-[11px] font-mono text-white/80">{ev.agent}</span>
                {ev.payload?.strategy && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/60 uppercase">
                    {ev.payload.strategy}
                  </span>
                )}
              </div>
              
              {ev.payload?.error && (
                <div className="mt-1.5 pl-1 text-[10px] text-red-400/80 font-mono break-all leading-tight">
                  {ev.payload.error}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
