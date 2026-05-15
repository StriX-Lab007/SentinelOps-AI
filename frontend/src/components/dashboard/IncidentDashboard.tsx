'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIncidentStore } from '@/store/useIncidentStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Play, CheckCircle2, CircleDashed, Terminal, Zap } from 'lucide-react';

export default function IncidentDashboard() {
  const { 
    isInvestigating, 
    currentIncidentId, 
    agentSteps, 
    causalChain, 
    remediation,
    startInvestigation,
    updateStepStatus,
    completeInvestigation
  } = useIncidentStore();

  // Fake Async Visual Flow
  useEffect(() => {
    if (!isInvestigating) return;

    let isMounted = true;

    const runSimulation = async () => {
      // 1. Planner
      if (!isMounted) return;
      updateStepStatus('planner', 'running');
      await new Promise(r => setTimeout(r, 1500));
      updateStepStatus('planner', 'completed', 'Execution plan generated.');

      // 2. Logs
      if (!isMounted) return;
      updateStepStatus('log', 'running');
      await new Promise(r => setTimeout(r, 2000));
      updateStepStatus('log', 'completed', "Detected 'Connection Pool Exhaustion' in billing-service.");

      // 3. Deployment
      if (!isMounted) return;
      updateStepStatus('deploy', 'running');
      await new Promise(r => setTimeout(r, 1800));
      updateStepStatus('deploy', 'completed', 'Found suspicious deployment v2.14.0 at 14:02 UTC.');

      // 4. Correlator
      if (!isMounted) return;
      updateStepStatus('correlator', 'running');
      await new Promise(r => setTimeout(r, 2500));
      updateStepStatus('correlator', 'completed', 'Causal chain established with 82% confidence.');

      // Done
      if (!isMounted) return;
      completeInvestigation(
        "Deployment v2.14.0 introduced a connection leak in the billing-service, leading to pool exhaustion and a P99 latency spike > 2.4s.",
        "Rollback billing-service to v2.13.9. Execute automated script: `kubectl rollout undo deployment/billing-service`"
      );
    };

    runSimulation();

    return () => { isMounted = false; };
  }, [isInvestigating, updateStepStatus, completeInvestigation]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pt-10">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Investigation</h1>
          <p className="text-muted-foreground mt-1">
            SentinelOps AI is monitoring production telemetry.
          </p>
        </div>
        
        {!isInvestigating && !causalChain ? (
          <Button onClick={() => startInvestigation()} size="lg" className="bg-blue-600 hover:bg-blue-700">
            <Play className="mr-2 h-4 w-4" /> Simulate Webhook Trigger
          </Button>
        ) : (
          <Badge variant={isInvestigating ? "destructive" : "secondary"} className="text-sm px-4 py-1">
            {isInvestigating ? (
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Triage in Progress
              </span>
            ) : "Investigation Complete"}
          </Badge>
        )}
      </div>

      {currentIncidentId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          
          {/* Timeline / Live Stream */}
          <Card className="md:col-span-1 shadow-lg border-slate-800 bg-slate-950/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="h-5 w-5 text-blue-400" /> Agent Swarm Stream
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-6">
                  {agentSteps.map((step, idx) => (
                    <motion.div 
                      key={step.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="relative pl-6 border-l-2 border-slate-800"
                    >
                      <span className="absolute -left-[11px] top-1 bg-slate-950">
                        {step.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-emerald-500 bg-slate-950" />}
                        {step.status === 'running' && <CircleDashed className="h-5 w-5 text-blue-500 animate-spin bg-slate-950" />}
                        {step.status === 'pending' && <CircleDashed className="h-5 w-5 text-slate-700 bg-slate-950" />}
                      </span>
                      
                      <div className="flex flex-col">
                        <span className={`font-medium ${step.status === 'running' ? 'text-blue-400' : step.status === 'completed' ? 'text-slate-200' : 'text-slate-600'}`}>
                          {step.name}
                        </span>
                        {step.output && (
                          <motion.span 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="text-sm text-muted-foreground mt-1 bg-slate-900/50 p-2 rounded-md border border-slate-800"
                          >
                            {step.output}
                          </motion.span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Report output */}
          <Card className="md:col-span-2 shadow-lg border-slate-800 bg-slate-950/50 relative overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">Incident Report: {currentIncidentId}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {!causalChain && !isInvestigating && (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  Awaiting incident payload...
                </div>
              )}

              {isInvestigating && !causalChain && (
                <div className="flex h-[300px] flex-col items-center justify-center space-y-4 text-muted-foreground">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
                  <p>Agents are analyzing telemetry...</p>
                </div>
              )}

              <AnimatePresence>
                {causalChain && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-2">Root Cause Analysis</h3>
                      <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-100">
                        {causalChain}
                      </div>
                    </div>

                    <Separator className="bg-slate-800" />

                    <div>
                      <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4" /> Remediation Plan
                      </h3>
                      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-100">
                        {remediation}
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                        Acknowledge & Execute Plan
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
