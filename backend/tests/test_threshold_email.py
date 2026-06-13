"""
TDD — services/email_service.send_threshold_alert_email

Email khẩn khi thông số vận hành vượt ngưỡng. Khác email check-in thường:
luôn gửi (không phụ thuộc EMAIL_ALERTS_ONLY), subject có tiền tố cảnh báo,
liệt kê từng thông số breach kèm giá trị đo và ngưỡng.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock


def _breaches():
    return [
        {"tag": "PI-01", "label": "Áp suất", "unit": "bar", "value": 5, "low": 10, "high": 20, "kind": "low"},
        {"tag": "TI-02", "label": "Nhiệt độ", "unit": "°C", "value": 95, "low": 40, "high": 80, "kind": "high"},
    ]


def _patch_resend(monkeypatch, captured):
    """Mock module resend trong email_service, capture params gửi đi."""
    from services import email_service

    fake = MagicMock()

    def _send(params):
        captured.update(params)
        return SimpleNamespace(id="msg_test")

    fake.Resend.return_value.emails.send.side_effect = _send
    monkeypatch.setattr(email_service, "resend", fake)
    return email_service


class TestThresholdAlertGuards:
    def test_returns_false_when_no_api_key(self, monkeypatch):
        from services import email_service
        monkeypatch.setattr(email_service, "RESEND_API_KEY", "")
        ok, err = email_service.send_threshold_alert_email(
            "Trạm A", datetime.now(timezone.utc), "dev-1", _breaches()
        )
        assert ok is False
        assert "RESEND_API_KEY" in err

    def test_returns_false_when_no_recipients(self, monkeypatch):
        from services import email_service
        monkeypatch.setattr(email_service, "RESEND_API_KEY", "re_x")
        monkeypatch.setattr(email_service, "EMAIL_TO", "")
        ok, err = email_service.send_threshold_alert_email(
            "Trạm A", datetime.now(timezone.utc), "dev-1", _breaches()
        )
        assert ok is False
        assert "EMAIL_TO" in err

    def test_returns_false_when_no_breaches(self, monkeypatch):
        """Không có breach → không gửi gì (guard chống email rỗng)."""
        from services import email_service
        monkeypatch.setattr(email_service, "RESEND_API_KEY", "re_x")
        monkeypatch.setattr(email_service, "EMAIL_TO", "a@x.com")
        ok, err = email_service.send_threshold_alert_email(
            "Trạm A", datetime.now(timezone.utc), "dev-1", []
        )
        assert ok is False


class TestThresholdAlertSend:
    def _setup(self, monkeypatch):
        from services import email_service
        monkeypatch.setattr(email_service, "RESEND_API_KEY", "re_x")
        monkeypatch.setattr(email_service, "EMAIL_FROM", "alert@x.com")
        monkeypatch.setattr(email_service, "EMAIL_TO", "boss@x.com, ops@x.com")

    def test_sends_and_returns_ok(self, monkeypatch):
        self._setup(monkeypatch)
        captured = {}
        _patch_resend(monkeypatch, captured)
        from services import email_service
        ok, err = email_service.send_threshold_alert_email(
            "Trạm A", datetime(2026, 6, 13, 1, 30, tzinfo=timezone.utc), "dev-1", _breaches()
        )
        assert ok is True
        assert err == ""
        # gửi tới nhiều người nhận
        assert captured["to"] == ["boss@x.com", "ops@x.com"]
        assert captured["from"] == "alert@x.com"

    def test_subject_has_alert_prefix_and_station(self, monkeypatch):
        self._setup(monkeypatch)
        captured = {}
        _patch_resend(monkeypatch, captured)
        from services import email_service
        email_service.send_threshold_alert_email(
            "Trạm A", datetime(2026, 6, 13, 1, 30, tzinfo=timezone.utc), "dev-1", _breaches()
        )
        assert "🚨" in captured["subject"]
        assert "Trạm A" in captured["subject"]

    def test_html_lists_each_breached_param(self, monkeypatch):
        self._setup(monkeypatch)
        captured = {}
        _patch_resend(monkeypatch, captured)
        from services import email_service
        email_service.send_threshold_alert_email(
            "Trạm A", datetime(2026, 6, 13, 1, 30, tzinfo=timezone.utc), "dev-1", _breaches()
        )
        html = captured["html"]
        # cả hai thông số breach phải xuất hiện kèm nhãn + giá trị đo
        assert "Áp suất" in html
        assert "Nhiệt độ" in html
        assert "5" in html and "95" in html

    def test_returns_false_on_resend_exception(self, monkeypatch):
        self._setup(monkeypatch)
        from services import email_service
        fake = MagicMock()
        fake.Resend.return_value.emails.send.side_effect = Exception("boom")
        monkeypatch.setattr(email_service, "resend", fake)
        ok, err = email_service.send_threshold_alert_email(
            "Trạm A", datetime.now(timezone.utc), "dev-1", _breaches()
        )
        assert ok is False
        assert "boom" in err
