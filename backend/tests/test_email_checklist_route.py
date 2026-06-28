"""
TDD — POST /api/email-checklist

Endpoint công khai: nhận file Excel (base64) + subject + filename từ frontend,
gửi email kèm attachment cho quản lý (EMAIL_TO).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch
import config as cfg


@pytest.fixture
def app():
    with patch.object(cfg, "SessionLocal", None):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


class TestEmailChecklistValidation:
    def test_missing_file_base64_returns_400(self, client):
        resp = client.post("/api/email-checklist", json={
            "subject": "Pump", "filename": "pump.xlsx",
        })
        assert resp.status_code == 400

    def test_missing_filename_returns_400(self, client):
        resp = client.post("/api/email-checklist", json={
            "subject": "Pump", "file_base64": "UEs=",
        })
        assert resp.status_code == 400

    def test_empty_body_returns_400(self, client):
        resp = client.post("/api/email-checklist", json={})
        assert resp.status_code == 400


class TestEmailChecklistSend:
    def test_valid_payload_calls_email_service(self, client):
        with patch("routes.email_checklist.send_checklist_excel_email",
                   return_value=(True, "")) as mock:
            resp = client.post("/api/email-checklist", json={
                "subject": "Pump Check List",
                "filename": "pump.xlsx",
                "file_base64": "UEsDBBQ=",
            })
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"
        mock.assert_called_once_with(
            subject="Pump Check List",
            filename="pump.xlsx",
            file_base64="UEsDBBQ=",
        )

    def test_email_failure_returns_500(self, client):
        with patch("routes.email_checklist.send_checklist_excel_email",
                   return_value=(False, "RESEND_API_KEY chưa cấu hình")):
            resp = client.post("/api/email-checklist", json={
                "subject": "Pump", "filename": "pump.xlsx", "file_base64": "UEs=",
            })
        assert resp.status_code == 500
        assert resp.get_json()["status"] == "error"

    def test_default_subject_when_missing(self, client):
        with patch("routes.email_checklist.send_checklist_excel_email",
                   return_value=(True, "")) as mock:
            client.post("/api/email-checklist", json={
                "filename": "pump.xlsx", "file_base64": "UEs=",
            })
        # subject mặc định không rỗng
        assert mock.call_args.kwargs["subject"]
