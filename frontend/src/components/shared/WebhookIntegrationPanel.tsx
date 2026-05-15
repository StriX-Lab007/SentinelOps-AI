'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Copy, Check, Globe, Zap, 
  Terminal, ShieldCheck, Database, Layout
} from 'lucide-react';

interface WebhookPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCES = [
  { name: 'Datadog',   icon: <Zap size={14} />,     desc: 'Standard Webhook Integration' },
  { name: 'Grafana',   icon: <Layout size={14} />,  desc: 'Alertmanager / Webhook' },
  { name: 'PagerDuty', icon: <Terminal size={14} />, desc: 'Custom Event Transformation' },
  { name: 'Custom JSON', icon: <Database size={14} />, desc: 'Generic REST Payload' },
];

export default function WebhookIntegrationPanel({ isOpen, onClose }: WebhookPanelProps) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = "https://api.sentinelops.ai/webhook/alert";

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 m-auto w-full max-w-xl h-fit max-h-[80vh] bg-[#0D0D0F] border border-white/[0.08] rounded-2xl shadow-2xl z-[101] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                   <Globe size={18} className="text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold tracking-tight text-white">Connect Alert Source</h2>
                  <p className="text-[11px] text-white/50 mt-0.5">Integrate SentinelOps into your existing workflow</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* URL Section */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Universal Webhook Endpoint</label>
                <div className="flex gap-2">
                  <div className="flex-1 h-11 bg-white/[0.03] border border-white/[0.08] rounded-lg flex items-center px-4 font-mono text-[12px] text-indigo-300 overflow-hidden">
                    {webhookUrl}
                  </div>
                  <button 
                    onClick={handleCopy}
                    className="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                    {copied ? <Check size={18} className="text-white" /> : <Copy size={18} className="text-white" />}
                  </button>
                </div>
              </div>

              {/* Supported Sources */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Native Compatibility</label>
                <div className="grid grid-cols-2 gap-3">
                  {SOURCES.map((source) => (
                    <div 
                      key={source.name}
                      className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.05] flex items-center justify-center text-white/60 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-colors">
                           {source.icon}
                        </div>
                        <span className="text-[13px] font-semibold text-white/90">{source.name}</span>
                      </div>
                      <p className="text-[11px] text-white/40 leading-relaxed">{source.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Note */}
              <div className="p-4 rounded-xl border border-amber-500/10 bg-amber-500/5 flex gap-4">
                <ShieldCheck size={18} className="text-amber-500/60 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[12px] font-semibold text-amber-200/90">Enterprise Shielding Enabled</p>
                  <p className="text-[11px] text-amber-200/50 mt-1 leading-relaxed">
                    All incoming signals are automatically sanitized and de-duplicated. SentinelOps uses zero-trust validation for external triggers.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.08] bg-white/[0.01] flex items-center justify-between">
               <button 
                 onClick={onClose}
                 className="text-[12px] font-bold text-white/40 hover:text-white transition-colors"
               >
                 Maybe later
               </button>
               <button 
                 onClick={onClose}
                 className="px-6 h-9 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[12px] font-bold text-white transition-all active:scale-95"
               >
                 View Documentation
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
