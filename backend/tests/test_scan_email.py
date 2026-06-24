"""
TDD — services/email_service.send_scan_email

Tập trung vào render nội dung email check-in cho từng geo_status. Đặc biệt:
geo_status='unverified' (trạm chưa cấu hình tọa độ GPS) phải có nhãn rõ ràng —
không hiện chuỗi thô 'unverified' và không nói nhầm "không có GPS" (GPS vẫn có).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
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
    monkeypatch.setattr(email_service, "EMAIL_TO", "boss@example.com")
    return email_service


class TestUnverifiedRendering:
    def test_unverified_html_has_meaningful_label_not_raw_status(self, monkeypatch):
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        ok, err = email_service.send_scan_email(
            location="PUMP_STATION_6",
            scanned_at=datetime.now(timezone.utc),
            device_id="dev-1",
            lat=15.12492,
            lng=108.78122,
            geo_status="unverified",
        )
        assert ok is True, err
        html = captured["html"]
        # Không để lộ chuỗi thô 'unverified'
        assert "unverified" not in html
        # Có nhãn nói về việc trạm chưa cấu hình tọa độ
        assert "chưa cấu hình tọa độ" in html

    def test_unverified_status_does_not_claim_no_gps(self, monkeypatch):
        """GPS vẫn có (chỉ thiếu tọa độ trạm) → không được nói "không có GPS"."""
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        email_service.send_scan_email(
            location="PUMP_STATION_6",
            scanned_at=datetime.now(timezone.utc),
            device_id="dev-1",
            lat=15.12492,
            lng=108.78122,
            geo_status="unverified",
        )
        html = captured["html"]
        assert "không có GPS" not in html

    def test_unverified_includes_maps_link(self, monkeypatch):
        """Có lat/lng → email vẫn kèm link bản đồ để kiểm tra vị trí nhân viên."""
        captured = {}
        email_service = _patch_resend(monkeypatch, captured)
        email_service.send_scan_email(
            location="PUMP_STATION_6",
            scanned_at=datetime.now(timezone.utc),
            device_id="dev-1",
            lat=15.12492,
            lng=108.78122,
            geo_status="unverified",
        )
        assert "maps.google.com/?q=15.12492,108.78122" in captured["html"]
