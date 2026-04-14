"""
TDD — scan_service.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch, call
from models import ScanLog


def _make_session(scan_id=42):
    """Tạo mock session, tự assign id khi flush."""
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    def flush_side_effect():
        # Giả lập DB assign id
        session.add.call_args[0][0].id = scan_id

    session.flush.side_effect = flush_side_effect
    return session


class TestProcessScan:
    def test_missing_location_returns_error(self):
        from services.scan_service import process_scan
        result = process_scan(location="")
        assert result["status"] == "error"
        assert "location" in result["message"]

    def test_whitespace_location_returns_error(self):
        from services.scan_service import process_scan
        result = process_scan(location="   ")
        assert result["status"] == "error"

    def test_invalid_scanned_at_returns_error(self):
        from services.scan_service import process_scan
        with patch("services.scan_service.SessionLocal", return_value=_make_session()):
            with patch("services.scan_service.send_scan_email", return_value=True):
                result = process_scan(location="Cổng A", scanned_at="not-a-date")
        assert result["status"] == "error"
        assert "scanned_at" in result["message"]

    def test_valid_scan_returns_ok(self):
        from services.scan_service import process_scan
        session = _make_session(scan_id=1)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=True):
                result = process_scan(location="Cổng A")
        assert result["status"] == "ok"
        assert result["scan_id"] == 1

    def test_email_sent_true_when_email_succeeds(self):
        from services.scan_service import process_scan
        session = _make_session(scan_id=2)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=True) as mock_email:
                result = process_scan(location="Kho 1")
        assert result["status"] == "ok"
        assert "gửi email" in result["message"]

    def test_email_sent_false_when_email_fails(self):
        from services.scan_service import process_scan
        session = _make_session(scan_id=3)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=False):
                result = process_scan(location="Kho 1")
        assert result["status"] == "ok"
        assert "chưa gửi được" in result["message"]

    def test_location_is_stripped(self):
        """Tên trạm có khoảng trắng thừa → được strip"""
        from services.scan_service import process_scan
        session = _make_session(scan_id=5)
        added_log = None

        def capture_add(log):
            nonlocal added_log
            added_log = log

        session.add.side_effect = capture_add

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=True):
                process_scan(location="  Cổng A  ")

        assert added_log is not None
        assert added_log.location == "Cổng A"

    def test_gps_fields_stored(self):
        """lat/lng/accuracy/geo_distance/geo_status được lưu đúng"""
        from services.scan_service import process_scan
        session = _make_session(scan_id=6)
        added_log = None

        def capture_add(log):
            nonlocal added_log
            added_log = log

        session.add.side_effect = capture_add

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=True):
                process_scan(
                    location="Cổng A",
                    lat=10.823456,
                    lng=106.629123,
                    accuracy=5.0,
                    geo_distance=12.4,
                    geo_status="ok",
                )

        assert added_log.lat == 10.823456
        assert added_log.lng == 106.629123
        assert added_log.gps_accuracy == 5.0
        assert added_log.geo_distance == 12.4
        assert added_log.geo_status == "ok"

    def test_iso_scanned_at_parsed_correctly(self):
        from services.scan_service import process_scan
        session = _make_session(scan_id=7)
        added_log = None

        def capture_add(log):
            nonlocal added_log
            added_log = log

        session.add.side_effect = capture_add

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=True):
                process_scan(
                    location="Cổng A",
                    scanned_at="2026-04-14T08:30:00+07:00",
                )

        assert added_log is not None
        # datetime giữ nguyên timezone +07:00, convert sang UTC để verify
        from datetime import timezone
        utc_dt = added_log.scanned_at.astimezone(timezone.utc)
        assert utc_dt.hour == 1   # 08:30 +07:00 = 01:30 UTC
