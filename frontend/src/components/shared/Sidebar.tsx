'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Terminal, AlertTriangle, GitBranch, Cpu,
  Archive, Settings, BookOpen, ChevronRight
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeColor?: string;
}

const navItems: NavItem[] = [
  { id: 'command',       label: 'Operations',  icon: <Terminal size={16} /> },
  { id: 'incidents',     label: 'Incidents',   icon: <AlertTriangle size={16} />, badge: 3, badgeColor: '#FF6B6B' },
  { id: 'orchestration', label: 'Orchestrator', icon: <GitBranch size={16} /> },
  { id: 'agents',        label: 'Agents',      icon: <Cpu size={16} /> },
  { id: 'artifacts',     label: 'Artifacts',   icon: <Archive size={16} /> },
];

const bottomItems: NavItem[] = [
  { id: 'docs',     label: 'Docs',     icon: <BookOpen size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col w-[220px] shrink-0 h-screen sticky top-0"
      style={{
        background: 'var(--so-surface)',
        borderRight: '1px solid var(--so-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: 'var(--so-border)' }}>
        <div className="relative flex items-center justify-center w-7 h-7 rounded-md overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #A8A2FF 0%, #7B9EFF 100%)' }}>
          <span className="text-[10px] font-bold text-black">S</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--so-text)' }}>
            SentinelOps
          </span>
          <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'var(--so-text-muted)' }}>
            Autonomous
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md flex items-center gap-2"
        style={{ background: 'var(--so-stable-dim, rgba(78,222,158,0.08))', border: '1px solid rgba(78,222,158,0.15)' }}>
        <div className="relative flex items-center justify-center">
          <span className="absolute w-3 h-3 rounded-full opacity-30 pulse-stable" style={{ background: 'var(--so-stable)' }} />
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--so-stable)' }} />
        </div>
        <span className="text-[11px] font-medium tracking-wide" style={{ color: 'var(--so-stable)' }}>
          System Operational
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--so-text-subtle)' }}>
          Core
        </p>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={() => onTabChange(item.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left group transition-colors duration-150"
              style={{
                background: isActive ? 'rgba(168,162,255,0.12)' : 'transparent',
                color: isActive ? 'var(--so-primary)' : 'var(--so-text-muted)',
              }}
            >
              <span className="shrink-0 transition-colors"
                style={{ color: isActive ? 'var(--so-primary)' : 'var(--so-text-muted)' }}>
                {item.icon}
              </span>
              <span className="flex-1 text-[13px] font-medium">{item.label}</span>
              {item.badge !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                  style={{ background: (item.badgeColor || 'var(--so-primary)') + '22', color: item.badgeColor || 'var(--so-primary)' }}>
                  {item.badge}
                </span>
              )}
              {isActive && (
                <ChevronRight size={12} style={{ color: 'var(--so-primary)', opacity: 0.6 }} />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-2 py-2 border-t space-y-0.5" style={{ borderColor: 'var(--so-border)' }}>
        {bottomItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={() => onTabChange(item.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors duration-150"
              style={{
                color: isActive ? 'var(--so-primary)' : 'var(--so-text-muted)',
                background: isActive ? 'rgba(168,162,255,0.12)' : 'transparent',
              }}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t flex items-center gap-2.5" style={{ borderColor: 'var(--so-border)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #A8A2FF 0%, #7B9EFF 100%)', color: '#0B0B0C' }}>
          U
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] font-medium truncate" style={{ color: 'var(--so-text)' }}>Engineer</span>
          <span className="text-[10px] truncate" style={{ color: 'var(--so-text-muted)' }}>On-call</span>
        </div>
      </div>
    </motion.aside>
  );
}
