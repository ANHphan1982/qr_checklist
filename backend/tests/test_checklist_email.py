"""
TDD — services/email_service.send_checklist_excel_email

Gửi email kèm file Excel (checklist từng loại) dưới dạng attachment. Frontend
dựng workbook base64 rồi POST lên backend; backend forward sang Resend.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from types import SimpleNamespace
from unittest.mock import MagicMock


def _patch_resend(monkeypatch, captured):
    from services import email_service

    fake = MagicMock()

    def _send(params):
        captured.update(params)
        return SimpleNamespace(id="msg_test")

    fake.Resend.return_value.emails.send.side_effect = _send
    monkeypatch.setattr(email_service, "resend", fake)
    monkeypatch.setattr(email_service, "RESEND_API_KEY", "re_x")
    monkeypatch.setattr(email_service, "EMAIL_TO", "boss@example.com,ops@example.com")
    return email_service


class TestSendChecklistExcelEmail:
    def test_attaches_excel_with_filename_and_base64_content(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        ok, err = email_service.send_checklist_excel_email(
            subject="Pump Check List — báo cáo ca",
            filename="pump-day.xlsx",
            file_base64="UEsDBBQAAAA=",
        )
        assert ok is True, err
        assert captured["subject"] == "Pump Check List — báo cáo ca"
        atts = captured["attachments"]
        assert len(atts) == 1
        assert atts[0]["filename"] == "pump-day.xlsx"
        assert atts[0]["content"] == "UEsDBBQAAAA="

    def test_sends_to_all_configured_recipients(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        email_service.send_checklist_excel_email(
            subject="S", filename="f.xlsx", file_base64="UEs=",
        )
        assert captured["to"] == ["boss@example.com", "ops@example.com"]

    def test_returns_error_when_no_api_key(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        monkeypatch.setattr(email_service, "RESEND_API_KEY", "")
        ok, err = email_service.send_checklist_excel_email(
            subject="S", filename="f.xlsx", file_base64="UEs=",
        )
        assert ok is False
        assert "RESEND_API_KEY" in err

    def test_returns_error_when_no_recipients(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        monkeypatch.setattr(email_service, "EMAIL_TO", "")
        ok, err = email_service.send_checklist_excel_email(
            subject="S", filename="f.xlsx", file_base64="UEs=",
        )
        assert ok is False
        assert "EMAIL_TO" in err

    def test_returns_error_when_attachment_empty(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        ok, err = email_service.send_checklist_excel_email(
            subject="S", filename="f.xlsx", file_base64="",
        )
        assert ok is False
        assert "đính kèm" in err.lower() or "attachment" in err.lower()
