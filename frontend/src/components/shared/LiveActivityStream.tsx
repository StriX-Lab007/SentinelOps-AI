'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Radio } from 'lucide-react';
import { useIncidentStore, type ActivityEntry } from '@/store/useIncidentStore';

/* ── colour config per event type ──────────────────────────────── */

const typeStyle: Record<ActivityEntry['type'], { dot: string; glow: string }> = {
  info:    { dot: '#7B9EFF', glow: 'rgba(123,158,255,0.12)' },
  warn:    { dot: '#FFB347', glow: 'rgba(255,179,71,0.12)' },
  success: { dot: '#4EDE9E', glow: 'rgba(78,222,158,0.12)' },
  error:   { dot: '#FF6B6B', glow: 'rgba(255,107,107,0.12)' },
};

/* ── component ─────────────────────────────────────────────────── */

export default function LiveActivityStream() {
  const { activityLog, isInvestigating } = useIncidentStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  /* auto-scroll to newest event */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityLog.length]);

  return (
    <div className="flex flex-col h-full">
      {/* ── header ──────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2 shrink-0"
        style={{ borderColor: 'var(--so-border)' }}
      >
        <Activity size={14} style={{ color: 'var(--so-info, #7B9EFF)' }} />
        <span
          className="text-[12px] font-semibold tracking-wide uppercase"
          style={{ color: 'var(--so-text-muted)' }}
        >
          Activity Stream
        </span>

        {isInvestigating && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: '#4EDE9E' }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: '#4EDE9E' }}
              />
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: '#4EDE9E' }}
            >
              Live
            </span>
          </span>
        )}
      </div>

      {/* ── event stream ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {activityLog.map((entry) => {
            const s = typeStyle[entry.type];
            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                  mass: 0.8,
                  opacity: { duration: 0.2 },
                }}
                className="overflow-hidden"
              >
                <div
                  className="flex items-start gap-2.5 py-[6px] px-2.5 rounded-md transition-colors hover:bg-white/[0.02]"
                >
                  {/* timestamp */}
                  <span
                    className="text-[10px] font-mono shrink-0 mt-[2px] tabular-nums select-none opacity-50"
                    style={{ color: 'var(--so-text-muted)' }}
                  >
                    {entry.time}
                  </span>

                  {/* dot with glow */}
                  <span className="relative shrink-0 mt-[6px]">
                    <span
                      className="absolute -inset-1 rounded-full opacity-40"
                      style={{ background: s.glow }}
                    />
                    <span
                      className="relative block w-[5px] h-[5px] rounded-full"
                      style={{ background: s.dot, boxShadow: `0 0 4px ${s.dot}40` }}
                    />
                  </span>

                  {/* message */}
                  <span
                    className="text-[11px] leading-relaxed"
                    style={{ color: 'var(--so-text-muted)' }}
                  >
                    {entry.text}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* empty state */}
        {activityLog.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
            <Radio size={20} style={{ color: 'var(--so-text-subtle)', opacity: 0.3 }} />
            <p className="text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>
              Waiting for events…
            </p>
          </div>
        )}

        {/* scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
