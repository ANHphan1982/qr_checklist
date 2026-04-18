"""
E2E tests — /api/reports/trigger-summary endpoint
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, MagicMock
import config as cfg


@pytest.fixture
def app():
    with patch.object(cfg, "ADMIN_SECRET", "test-secret"), \
         patch.object(cfg, "SessionLocal", None):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


class TestTriggerSummaryAuth:
    def test_missing_auth_returns_401(self, client):
        resp = client.get("/api/reports/trigger-summary?period=morning")
        assert resp.status_code == 401

    def test_wrong_key_header_returns_401(self, client):
        resp = client.get("/api/reports/trigger-summary?period=morning",
                          headers={"X-Admin-Key": "wrong"})
        assert resp.status_code == 401

    def test_wrong_key_param_returns_401(self, client):
        resp = client.get("/api/reports/trigger-summary?period=morning&key=wrong")
        assert resp.status_code == 401

    def test_correct_header_passes_auth(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "ok")):
            resp = client.get("/api/reports/trigger-summary?period=morning",
                              headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200

    def test_correct_query_param_passes_auth(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "ok")):
            resp = client.get("/api/reports/trigger-summary?period=morning&key=test-secret")
        assert resp.status_code == 200


class TestTriggerSummaryPeriod:
    def test_invalid_period_returns_400(self, client):
        resp = client.get("/api/reports/trigger-summary?period=noon",
                          headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 400

    def test_morning_period_accepted(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "Đã gửi")) as mock:
            client.get("/api/reports/trigger-summary?period=morning",
                       headers={"X-Admin-Key": "test-secret"})
        mock.assert_called_once_with("morning")

    def test_evening_period_accepted(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "Đã gửi")) as mock:
            client.get("/api/reports/trigger-summary?period=evening",
                       headers={"X-Admin-Key": "test-secret"})
        mock.assert_called_once_with("evening")

    def test_default_period_is_morning(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "ok")) as mock:
            client.get("/api/reports/trigger-summary",
                       headers={"X-Admin-Key": "test-secret"})
        mock.assert_called_once_with("morning")


class TestTriggerSummaryResponse:
    def test_success_returns_200_with_ok_status(self, client):
        with patch("routes.summary.send_summary_report", return_value=(True, "Đã gửi 5 scans")):
            resp = client.get("/api/reports/trigger-summary?period=morning",
                              headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"
        assert "5 scans" in data["message"]

    def test_failure_returns_500_with_error_status(self, client):
        with patch("routes.summary.send_summary_report", return_value=(False, "RESEND_API_KEY chưa cấu hình")):
            resp = client.get("/api/reports/trigger-summary?period=morning",
                              headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["status"] == "error"
