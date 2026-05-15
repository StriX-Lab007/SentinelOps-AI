'use client';

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileText, MessageSquare, GitPullRequest, History, Zap, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useIncidentStore } from '@/store/useIncidentStore';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function GeneratedArtifactsView() {
  const { causalChain, remediation, currentIncidentId } = useIncidentStore();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-6 pb-20">
      
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Generated Artifacts</h1>
        <p className="text-muted-foreground">
          Autonomous outputs compiled during the investigation of {currentIncidentId || 'INC-8291'}.
        </p>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        
        {/* LEFT COLUMN: Intelligence Core */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* RCA Report */}
          <motion.div variants={itemVariants}>
            <Card className="border-slate-800 bg-slate-950 shadow-md">
              <CardHeader className="pb-4 border-b border-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <CardTitle className="text-lg">Root Cause Analysis</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                    High Confidence
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4 text-sm text-slate-300 leading-relaxed font-mono">
                <div className="space-y-2">
                  <h4 className="text-slate-50 font-semibold tracking-tight font-sans">1. Executive Summary</h4>
                  <p>A deployment of `billing-service` (v2.14.0) introduced a severe database connection leak, leading to pool exhaustion. Upstream dependent services experienced P99 latency spikes exceeding 2.4s, triggering the initial Datadog alert.</p>
                </div>
                
                <Separator className="bg-slate-800" />
                
                <div className="space-y-2">
                  <h4 className="text-slate-50 font-semibold tracking-tight font-sans">2. Operational Timeline</h4>
                  <ul className="space-y-3 mt-2">
                    <li className="flex gap-3">
                      <span className="text-slate-500">14:02 UTC</span>
                      <span>Deployment `v2.14.0` rolled out to production cluster.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-slate-500">14:05 UTC</span>
                      <span>DB connection count on primary replica spikes from 45 -{'>'} 500 (Max).</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-slate-500">14:07 UTC</span>
                      <span className="text-rose-400">P99 Latency {'>'} 2.4s. Webhook fired.</span>
                    </li>
                  </ul>
                </div>

                <Separator className="bg-slate-800" />
                
                <div className="space-y-2">
                  <h4 className="text-slate-50 font-semibold tracking-tight font-sans">3. Causal Chain</h4>
                  <div className="p-3 bg-slate-900 rounded-md border border-slate-800 text-slate-400">
                    {causalChain || 'Commit `8f92a1c` → Connection not closed in `verifyTransaction()` → Pool Exhaustion → Query Timeout → Latency Spike'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Historical Matches */}
          <motion.div variants={itemVariants}>
            <Card className="border-slate-800 bg-slate-950 shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-slate-400" />
                  <CardTitle className="text-lg">Operational Memory Matches</CardTitle>
                </div>
                <CardDescription>Similar prior incidents retrieved via vector search.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  
                  <div className="flex items-center justify-between p-3 rounded-md border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-colors">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">INC-7042: Connection leak in auth-service</p>
                        <p className="text-xs text-slate-500">Occurred 4 months ago • Resolved via Rollback</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20">94% Match</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-md border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-colors">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-200">INC-4112: RDS Max Connections Reached</p>
                        <p className="text-xs text-slate-500">Occurred 11 months ago • Resolved via Instance Scaling</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-slate-700">68% Match</Badge>
                  </div>

                </div>
              </CardContent>
            </Card>
          </motion.div>

        </div>

        {/* RIGHT COLUMN: Operational Outputs */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Remediation Panel */}
          <motion.div variants={itemVariants}>
            <Card className="border-emerald-500/30 bg-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.05)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-emerald-400" />
                    <CardTitle className="text-lg">Recommended Action</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-300">
                  {remediation || 'Safest immediate mitigation is a rollback to the previous stable release. Database connections will naturally drop upon pod termination.'}
                </p>
                <div className="p-3 bg-slate-900 rounded-md border border-slate-800 font-mono text-xs text-emerald-300">
                  $ kubectl rollout undo deployment/billing-service
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-[0_0_15px_rgba(5,150,105,0.4)] transition-all">
                  Execute Rollback
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Slack Mock */}
          <motion.div variants={itemVariants}>
            <Card className="border-slate-800 bg-slate-950 shadow-md">
              <CardHeader className="pb-3 border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-slate-400" />
                  <CardTitle className="text-lg">Broadcast Notification</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {/* Slack Message Bubble */}
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">
                    S
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-sm text-slate-200">SentinelOps AI</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Badge className="h-4 px-1 text-[10px] font-normal rounded-sm bg-slate-800 text-slate-300 border-none">APP</Badge> 14:08</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      🚨 <span className="font-semibold text-slate-50">INC-8291: Latency Spike in billing-service</span>
                    </p>
                    <div className="mt-2 border-l-4 border-rose-500 pl-3 py-1 space-y-2 w-full">
                      <p className="text-sm text-slate-300">
                        I have completed the autonomous triage. The issue is a database connection pool exhaustion caused by a leak in the recent <code className="text-xs bg-slate-800 px-1 py-0.5 rounded text-rose-300">v2.14.0</code> deployment.
                      </p>
                      <p className="text-sm text-slate-300">
                        I highly recommend an immediate rollback.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:text-slate-50 hover:bg-slate-800">View RCA Report</Button>
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">Approve Rollback</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* GitHub Mock */}
          <motion.div variants={itemVariants}>
            <Card className="border-slate-800 bg-slate-950 shadow-md">
              <CardHeader className="pb-3 border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5 text-slate-400" />
                  <CardTitle className="text-lg">Tracking Ticket</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-rose-500/50 text-rose-400 bg-rose-500/10 rounded-full text-xs">bug</Badge>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 rounded-full text-xs">sev-1</Badge>
                  </div>
                  <h3 className="font-medium text-slate-200 leading-snug">Memory leak in billing-service verifyTransaction <span className="text-slate-500 font-normal">#1042</span></h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span>Opened autonomously by SentinelOps AI</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
}
