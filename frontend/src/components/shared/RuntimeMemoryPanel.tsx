'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useIncidentStore } from '@/store/useIncidentStore';

export default function RuntimeMemoryPanel() {
  const { snapshotLog, isInvestigating } = useIncidentStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [snapshotLog.length]);

  return (
    <div className="flex flex-col h-full bg-[#0D0D0F]">
      <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--so-border)' }}>
        <Database size={14} className="text-indigo-400" />
        <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--so-text-muted)' }}>
          Runtime Memory
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {snapshotLog.map((entry) => {
            let Icon = CheckCircle2;
            let iconColor = 'text-emerald-400';
            let bgClass = 'bg-emerald-500/5 border-emerald-500/10';

            if (entry.status === 'failed') {
              Icon = ShieldAlert;
              iconColor = 'text-red-400';
              bgClass = 'bg-red-500/10 border-red-500/20';
            } else if (entry.status === 'recovered' || entry.status === 'replayed') {
              Icon = RefreshCw;
              iconColor = 'text-amber-400 animate-spin-slow';
              bgClass = 'bg-amber-500/10 border-amber-500/20';
            }

            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`mb-2 p-2.5 rounded border ${bgClass} flex flex-col gap-1.5`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={12} className={iconColor} />
                  <span className="text-[10px] font-mono opacity-50 text-white/50">{entry.time}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${iconColor}`}>
                    {entry.status}
                  </span>
                </div>
                <div className="pl-5 text-[11px] font-medium text-white/80">
                  {entry.message}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {snapshotLog.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <Database size={16} className="text-white/20" />
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Awaiting Snapshots</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
