# Workflow Architecture

## Core Workflow

Webhook Alert
↓
Planner Agent
↓
Parallel:
- Log Agent
- Trace Agent
- Deployment Agent
↓
Correlation Agent
↓
Remediation Agent
↓
Reporter Agent
↓
Generated Artifacts

## Agent States
- idle
- queued
- running
- retrying
- completed
- failed

## Core UI Requirement
The frontend must progressively visualize workflow execution in real time.
