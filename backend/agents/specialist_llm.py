"""Domain-specific LLM analysis for specialist agents."""
from __future__ import annotations

from typing import Any, Dict, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from .llm_utils import get_llm
from backend.omium_tracing import invoke_with_trace


def analyze_logs(service: str, raw_logs: list, rule_summary: str) -> Optional[str]:
    llm = get_llm()
    if not llm:
        return None
    sample = "\n".join(
        f"- [{l.get('level')}] {l.get('message')}" for l in raw_logs[:12]
    )
    prompt = ChatPromptTemplate.from_template(
        """You are the Log Investigation Agent for {service}.
Analyze ONLY the log evidence below. Do not invent services.

LOGS:
{sample}

RULE SUMMARY: {rule_summary}

Write 2-3 sentences: top error pattern, likely subsystem (DB pool, API, etc), and severity.
Be specific about timeouts or pool exhaustion if present."""
    )
    try:
        chain = prompt | llm | StrOutputParser()
        return invoke_with_trace(chain, {
            "service": service,
            "sample": sample or "(empty)",
            "rule_summary": rule_summary,
        })
    except Exception as e:
        print(f"[LogAgent LLM] {e}")
        return None


def analyze_traces(service: str, spans: list, rule_summary: str) -> Optional[str]:
    llm = get_llm()
    if not llm:
        return None
    sample = "\n".join(
        f"- {s.get('operation')}: {s.get('duration_ms')}ms ({s.get('status')})"
        for s in spans[:10]
    )
    prompt = ChatPromptTemplate.from_template(
        """You are the Trace Agent for {service}.
Identify the dependency bottleneck from spans only.

SPANS:
{sample}

RULE SUMMARY: {rule_summary}

Write 2-3 sentences naming the slowest span, downstream dependency, and user impact."""
    )
    try:
        chain = prompt | llm | StrOutputParser()
        return invoke_with_trace(chain, {
            "service": service,
            "sample": sample or "(empty)",
            "rule_summary": rule_summary,
        })
    except Exception as e:
        print(f"[TraceAgent LLM] {e}")
        return None


def analyze_deployments(service: str, deployments: list, rule_summary: str) -> Optional[str]:
    llm = get_llm()
    if not llm:
        return None
    sample = "\n".join(
        f"- {d.get('version')} @ {d.get('timestamp')} (commit {d.get('commit_hash')})"
        for d in deployments[:5]
    )
    prompt = ChatPromptTemplate.from_template(
        """You are the Deployment Agent for {service}.
Assess whether a recent deploy is a regression candidate.

DEPLOYMENTS:
{sample}

RULE SUMMARY: {rule_summary}

Write 2-3 sentences: latest version, timing vs incident, rollback target if obvious."""
    )
    try:
        chain = prompt | llm | StrOutputParser()
        return invoke_with_trace(chain, {
            "service": service,
            "sample": sample or "(empty)",
            "rule_summary": rule_summary,
        })
    except Exception as e:
        print(f"[DeployAgent LLM] {e}")
        return None
