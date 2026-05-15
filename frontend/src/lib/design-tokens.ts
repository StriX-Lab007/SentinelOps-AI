// Design System Tokens matching Stitch SentinelOps design
export const colors = {
  bg: '#0B0B0C',
  surface: '#111113',
  surfaceContainer: '#1C1C1F',
  surfaceContainerHigh: '#232326',
  border: 'rgba(255,255,255,0.06)',
  borderMuted: 'rgba(255,255,255,0.04)',
  primary: '#A8A2FF',
  primaryContainer: 'rgba(168,162,255,0.15)',
  onSurface: '#E5E2E1',
  onSurfaceVariant: '#C7C4D7',
  critical: '#FF6B6B',
  criticalContainer: 'rgba(255,107,107,0.12)',
  high: '#FFB347',
  highContainer: 'rgba(255,179,71,0.12)',
  stable: '#4EDE9E',
  stableContainer: 'rgba(78,222,158,0.12)',
  info: '#7B9EFF',
  infoContainer: 'rgba(123,158,255,0.12)',
};

export type AgentStatus = 'idle' | 'queued' | 'running' | 'retrying' | 'completed' | 'failed';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export const severityConfig = {
  critical: { color: colors.critical, bg: colors.criticalContainer, label: 'CRITICAL' },
  high: { color: colors.high, bg: colors.highContainer, label: 'HIGH' },
  medium: { color: '#FFD700', bg: 'rgba(255,215,0,0.12)', label: 'MEDIUM' },
  low: { color: colors.stable, bg: colors.stableContainer, label: 'LOW' },
};

export const agentStatusConfig: Record<AgentStatus, { color: string; label: string }> = {
  idle: { color: colors.onSurfaceVariant, label: 'IDLE' },
  queued: { color: colors.high, label: 'QUEUED' },
  running: { color: colors.primary, label: 'RUNNING' },
  retrying: { color: colors.high, label: 'RETRYING' },
  completed: { color: colors.stable, label: 'DONE' },
  failed: { color: colors.critical, label: 'FAILED' },
};
