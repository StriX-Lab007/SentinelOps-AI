"use client";

import { useIncidentStore } from '@/store/useIncidentStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ApprovalModal() {
  const pendingIntervention = useIncidentStore((s) => s.pendingIntervention);
  const resolveIntervention = useIncidentStore((s) => s.resolveIntervention);

  if (!pendingIntervention) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-rose-900/50 bg-[#0A0A0A] shadow-2xl shadow-rose-900/20"
      >
        {/* Header */}
        <div className="flex items-center space-x-3 border-b border-rose-900/30 bg-rose-950/20 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-rose-50">Human Intervention Required</h2>
            <p className="text-sm text-rose-400/80">Low-confidence recovery action paused</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-400">Target Agent</span>
              <Badge variant="outline" className="border-neutral-700 bg-neutral-800 font-mono">
                {pendingIntervention.agent}
              </Badge>
            </div>
            
            <div className="mb-4 space-y-1">
              <span className="text-sm font-medium text-neutral-400">Trigger Reason</span>
              <p className="text-sm text-neutral-200">
                {pendingIntervention.reason}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
              <span className="text-sm font-medium text-neutral-400">System Confidence</span>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-mono text-sm font-medium text-amber-500">
                  {Math.round(pendingIntervention.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-rose-500/10 p-3 text-sm text-rose-200/90 border border-rose-500/20">
            <strong>Warning:</strong> The Orchestrator has halted autonomous execution for this agent due to low confidence in the recovery strategy. Please approve or reject the proposed action.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 border-t border-neutral-800 bg-neutral-900/30 px-6 py-4">
          <Button
            variant="outline"
            onClick={() => resolveIntervention('reject')}
            className="border-neutral-700 hover:bg-rose-900/20 hover:text-rose-400 text-neutral-400"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject Action
          </Button>
          <Button
            onClick={() => resolveIntervention('approve')}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Approve Action
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
