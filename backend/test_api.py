"""
backend/test_api.py
-------------------------------------------------------------------------------
SentinelOps AI — Comprehensive Backend Test Suite (pytest)

Run from the project root:
    pytest backend/test_api.py -v

Coverage:
  HealthCheck     (1)  — /health is reachable and returns {"status": "ok"}
  Simulate Flow   (3)  — /simulate triggers a valid investigation
  Incident        (4)  — /incident/{id} returns correct fields and status
  Report          (3)  — /report/{id} tracks progress and returns content
  Formatters      (3)  — Slack / GitHub payload formatters produce valid output
-------------------------------------------------------------------------------
"""
from __future__ import annotations

import sys
import os
import time

# ── Path bootstrap ────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tools.slack_tools import format_incident_message
from backend.tools.github_tools import format_github_issue

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Re-use a single TestClient across the module for speed."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def incident_id(client):
    """Trigger /simulate once and return the incident_id for downstream tests."""
    resp = client.post("/simulate?background=true")
    assert resp.status_code == 200, f"Simulate failed: {resp.text}"
    data = resp.json()
    assert "incident_id" in data, "Response missing incident_id"
    return data["incident_id"]


# ── 1. Health Check ───────────────────────────────────────────────────────────

class TestHealthCheck:
    def test_health_returns_200(self, client):
        """GET /health must respond 200 OK."""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_returns_ok_status(self, client):
        """GET /health body must contain {"status": "ok"}."""
        resp = client.get("/health")
        data = resp.json()
        assert data.get("status") == "ok"


# ── 2. Simulate Flow ──────────────────────────────────────────────────────────

class TestSimulateFlow:
    def test_simulate_returns_200(self, client):
        """POST /simulate must return HTTP 200."""
        resp = client.post("/simulate?background=true")
        assert resp.status_code == 200

    def test_simulate_returns_accepted_status(self, client):
        """POST /simulate body must contain status == 'accepted'."""
        resp = client.post("/simulate?background=true")
        data = resp.json()
        assert data.get("status") == "accepted"

    def test_simulate_returns_incident_id(self, client):
        """POST /simulate must return a non-empty incident_id string."""
        resp = client.post("/simulate?background=true")
        data = resp.json()
        iid = data.get("incident_id")
        assert isinstance(iid, str) and len(iid) > 0

    def test_simulate_returns_stream_url(self, client):
        """POST /simulate must return a WebSocket stream path."""
        resp = client.post("/simulate?background=true")
        data = resp.json()
        stream = data.get("stream", "")
        assert stream.startswith("/ws/incident/")


# ── 3. Incident Data Integrity ────────────────────────────────────────────────

class TestIncidentEndpoint:
    def test_incident_returns_200(self, client, incident_id):
        """GET /incident/{id} must return 200 for a known incident."""
        resp = client.get(f"/incident/{incident_id}")
        assert resp.status_code == 200

    def test_incident_contains_required_fields(self, client, incident_id):
        """Response body must expose 'incident' and 'remediation_history' keys."""
        resp = client.get(f"/incident/{incident_id}")
        data = resp.json()
        assert "incident" in data
        assert "remediation_history" in data

    def test_incident_has_valid_severity(self, client, incident_id):
        """Incident severity must be one of the accepted values."""
        resp = client.get(f"/incident/{incident_id}")
        inc = resp.json()["incident"]
        assert inc.get("severity") in {"critical", "high", "medium", "low"}

    def test_incident_status_is_valid_transition(self, client, incident_id):
        """Incident status must be a recognized pipeline state."""
        valid_statuses = {
            "investigating", "planning", "correlating",
            "remediating", "reporting", "resolved", "failed",
        }
        resp = client.get(f"/incident/{incident_id}")
        inc = resp.json()["incident"]
        assert inc.get("status") in valid_statuses

    def test_incident_404_for_unknown_id(self, client):
        """GET /incident/nonexistent must return 404."""
        resp = client.get("/incident/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


# ── 4. Report Endpoint ────────────────────────────────────────────────────────

class TestReportEndpoint:
    def test_report_returns_200_or_in_progress(self, client, incident_id):
        """GET /report/{id} must return 200 at any point in the pipeline."""
        resp = client.get(f"/report/{incident_id}")
        assert resp.status_code == 200

    def test_report_in_progress_has_message_field(self, client, incident_id):
        """When report is not yet ready the body must contain a 'message' key."""
        resp = client.get(f"/report/{incident_id}")
        data = resp.json()
        # Either still generating (has 'message') or done (has 'report')
        assert "message" in data or "report" in data

    def test_report_404_for_unknown_id(self, client):
        """GET /report/nonexistent must return 404."""
        resp = client.get("/report/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


# ── 5. Notification Formatters ────────────────────────────────────────────────

class TestSlackFormatter:
    _SAMPLE = {
        "service": "checkout-api",
        "severity": "critical",
        "incident_id": "abc-123",
        "root_cause": "DB connection pool exhaustion after v2.14.0 deploy",
        "causal_chain": "deploy v2.14.0 -> pool exhaustion -> query timeouts -> P99 spike",
        "remediation_action": "Rollback to v2.13.9",
        "confidence_score": 0.91,
    }

    def test_slack_formatter_returns_string(self):
        """format_incident_message must return a non-empty string."""
        result = format_incident_message(**self._SAMPLE)
        assert isinstance(result, str) and len(result) > 0

    def test_slack_formatter_contains_service(self):
        """Formatted message must reference the service name."""
        result = format_incident_message(**self._SAMPLE)
        assert "checkout-api" in result

    def test_slack_formatter_contains_confidence(self):
        """Formatted message must surface the confidence score."""
        result = format_incident_message(**self._SAMPLE)
        # Accept either "91%" or "0.91" representation
        assert "91" in result or "confidence" in result.lower()


class TestGitHubFormatter:
    _SAMPLE = {
        "service": "checkout-api",
        "severity": "critical",
        "incident_id": "abc-123",
        "root_cause": "DB connection pool exhaustion after v2.14.0 deploy",
        "causal_chain": "deploy v2.14.0 -> pool exhaustion -> query timeouts -> P99 spike",
        "remediation_action": "Rollback to v2.13.9",
        "confidence_score": 0.91,
        "logs_summary": "3 pool-timeout ERRORs in 2 minutes",
        "deployment_summary": "v2.14.0 deployed 6 minutes before alert",
    }

    def test_github_formatter_returns_dict(self):
        """format_github_issue must return a dict with title, body, labels."""
        result = format_github_issue(**self._SAMPLE)
        assert isinstance(result, dict)
        assert "title" in result
        assert "body" in result
        assert "labels" in result

    def test_github_formatter_labels_list(self):
        """Labels field must be a non-empty list."""
        result = format_github_issue(**self._SAMPLE)
        assert isinstance(result["labels"], list) and len(result["labels"]) > 0

    def test_github_formatter_body_is_markdown(self):
        """Issue body must contain at least one Markdown heading."""
        result = format_github_issue(**self._SAMPLE)
        assert "#" in result["body"]
