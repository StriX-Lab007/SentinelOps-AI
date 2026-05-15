import React, { useState, useEffect } from 'react';
import { Settings2, Play, AlertTriangle } from 'lucide-react';

interface DemoControlsProps {
  onSimulate: (simulateFailures: string) => void;
  isInvestigating: boolean;
}

export default function DemoControls({ onSimulate, isInvestigating }: DemoControlsProps) {
  const [toggles, setToggles] = useState({
    trace_timeout: false,
    llm_failure: false,
    malformed_output: false,
    dependency_failure: false,
  });

  const activeCount = Object.values(toggles).filter(Boolean).length;

  const handleSimulateClick = () => {
    const active = Object.entries(toggles)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(',');
    onSimulate(active);
  };

  return (
    <div className="p-4 border-t bg-[#0D0D0F]" style={{ borderColor: 'var(--so-border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={14} className="text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
          Demo Injection Controls
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {[
          { key: 'trace_timeout', label: 'Trace Agent Timeout' },
          { key: 'llm_failure', label: 'LLM Rate Limit (Log Agent)' },
          { key: 'dependency_failure', label: 'Missing Module (Deploy Agent)' },
          { key: 'malformed_output', label: 'Malformed Output (Correlator)' },
        ].map((item) => (
          <label key={item.key} className="flex items-center justify-between cursor-pointer group">
            <span className="text-[11px] font-medium text-white/60 group-hover:text-white/90 transition-colors">
              {item.label}
            </span>
            <div className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${toggles[item.key as keyof typeof toggles] ? 'bg-indigo-500' : 'bg-white/10'}`}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${toggles[item.key as keyof typeof toggles] ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </div>
            <input 
              type="checkbox"
              className="sr-only"
              checked={toggles[item.key as keyof typeof toggles]}
              onChange={(e) => setToggles(prev => ({ ...prev, [item.key]: e.target.checked }))}
              disabled={isInvestigating}
            />
          </label>
        ))}
      </div>

      {activeCount > 0 && (
        <div className="mb-3 px-2 py-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2">
          <AlertTriangle size={10} className="text-indigo-400" />
          <span className="text-[9px] text-indigo-300 uppercase tracking-wider font-bold">
            {activeCount} Failure(s) Armed
          </span>
        </div>
      )}

      <button 
        onClick={handleSimulateClick}
        disabled={isInvestigating}
        className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[12px] font-bold rounded-md flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
      >
        <Play size={14} fill="currentColor" />
        {activeCount > 0 ? 'Run Autonomous Recovery Demo' : 'Run Standard Investigation'}
      </button>
    </div>
  );
}
