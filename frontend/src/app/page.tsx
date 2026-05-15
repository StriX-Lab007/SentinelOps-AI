'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import Sidebar from '@/components/shared/Sidebar';
import CommandCenter from '@/components/dashboard/CommandCenter';
import GeneratedArtifactsView from '@/components/artifacts/GeneratedArtifactsView';
import OrchestrationView from '@/components/orchestration/OrchestrationView';
import IncidentDetail from '@/components/incident/IncidentDetail';
import AgentsView from '@/components/agents/AgentsView';

const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('command');

  const renderView = () => {
    switch (activeTab) {
      case 'command':        return <CommandCenter onNavigate={setActiveTab} />;
      case 'incidents':      return <IncidentDetail />;
      case 'orchestration':  return <OrchestrationView />;
      case 'agents':         return <AgentsView />;
      case 'artifacts':      return <GeneratedArtifactsView />;
      default:
        return (
          <div className="flex h-full items-center justify-center text-center p-12">
            <div className="space-y-3">
              <div className="text-[13px] font-semibold" style={{ color: 'var(--so-text-muted)' }}>
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </div>
              <p className="text-[11px]" style={{ color: 'var(--so-text-subtle)' }}>Coming soon.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--so-bg)' }}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: 'var(--so-surface)' }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={pageVariants} initial="initial" animate="enter" exit="exit"
            className="flex-1 min-h-0 h-full overflow-y-auto">
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
