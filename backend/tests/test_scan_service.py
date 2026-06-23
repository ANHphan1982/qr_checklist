"""
TDD — scan_service.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch, call
from sqlalchemy.exc import IntegrityError
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
        result = process_scan(location="Cổng A", scanned_at="not-a-date")
        assert result["status"] == "error"
        assert "scanned_at" in result["message"]

    def test_valid_scan_returns_ok(self):
        from services.scan_service import process_scan
        session = _make_session(scan_id=1)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email"):
                result = process_scan(location="Cổng A")
        assert result["status"] == "ok"
        assert result["scan_id"] == 1

    def test_email_dispatched_in_background_with_scan_id(self):
        """Email không chạy trong request path — chỉ dispatch sau khi commit."""
        from services.scan_service import process_scan
        session = _make_session(scan_id=2)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email") as mock_dispatch:
                result = process_scan(location="Kho 1")
        assert result["status"] == "ok"
        # email_sent chưa biết tại thời điểm response (gửi nền) → None,
        # frontend chỉ cảnh báo khi === false nên None không gây báo lỗi sai
        assert result["email_sent"] is None
        assert "Đã ghi nhận" in result["message"]
        mock_dispatch.assert_called_once()
        assert mock_dispatch.call_args[0][0] == 2  # scan_id
        assert mock_dispatch.call_args[0][1]["location"] == "Kho 1"

    def test_email_dispatched_after_commit(self):
        """Dispatch email phải xảy ra SAU commit — không giữ transaction khi gọi Resend."""
        from services.scan_service import process_scan
        session = _make_session(scan_id=3)
        order = []
        session.commit.side_effect = lambda: order.append("commit")
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch(
                "services.scan_service._dispatch_email",
                side_effect=lambda *a, **k: order.append("email"),
            ):
                process_scan(location="Kho 1")
        assert order == ["commit", "email"]

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
            with patch("services.scan_service._dispatch_email"):
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
            with patch("services.scan_service._dispatch_email"):
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
            with patch("services.scan_service._dispatch_email"):
                process_scan(
                    location="Cổng A",
                    scanned_at="2026-04-14T08:30:00+07:00",
                )

        assert added_log is not None
        # datetime giữ nguyên timezone +07:00, convert sang UTC để verify
        from datetime import timezone
        utc_dt = added_log.scanned_at.astimezone(timezone.utc)
        assert utc_dt.hour == 1   # 08:30 +07:00 = 01:30 UTC


class TestSendEmailAndMark:
    """_send_email_and_mark — gửi email rồi cập nhật email_sent bằng session riêng."""

    def _mock_log_session(self):
        log = MagicMock()
        log.email_sent = False
        session = MagicMock()
        session.__enter__ = MagicMock(return_value=session)
        session.__exit__ = MagicMock(return_value=False)
        session.get.return_value = log
        return log, session

    def test_marks_email_sent_true_on_success(self):
        from services.scan_service import _send_email_and_mark
        log, session = self._mock_log_session()
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=(True, "")):
                _send_email_and_mark(42, {"location": "Kho 1"})
        assert log.email_sent is True
        session.commit.assert_called_once()

    def test_keeps_email_sent_false_on_failure(self):
        from services.scan_service import _send_email_and_mark
        log, session = self._mock_log_session()
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=(False, "timeout")):
                _send_email_and_mark(42, {"location": "Kho 1"})
        assert log.email_sent is False

    def test_db_error_does_not_raise(self):
        """Lỗi DB khi update email_sent không được lan ra ngoài (thread nền)."""
        from services.scan_service import _send_email_and_mark
        with patch("services.scan_service.SessionLocal", side_effect=Exception("DB down")):
            with patch("services.scan_service.send_scan_email", return_value=(True, "")):
                _send_email_and_mark(42, {"location": "Kho 1"})  # không raise


class TestEmailConditions:
    """Điều kiện gửi email check-in (khi EMAIL_ALERTS_ONLY=true):
    CHỈ gửi khi sai trạm (geo_status == 'out_of_range') HOẶC thời gian di chuyển
    giữa 2 trạm quá nhanh (route 'too_fast'). Vượt ngưỡng thông số đi qua kênh
    threshold alert riêng (luôn gửi, không phụ thuộc điều kiện này).

    EMAIL_ALERTS_ONLY=false giữ hành vi cũ — mọi check-in đều gửi email."""

    def _scan(self, *, geo_status="ok", alerts_only=True, route_too_fast=False):
        from services.scan_service import process_scan
        session = _make_session(scan_id=20)
        # Không có bản trùng (dedupe) — first() trả None để insert bình thường
        session.query.return_value.filter.return_value.first.return_value = None
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.check_rate_limit", return_value=None):
                with patch("services.scan_service.EMAIL_ALERTS_ONLY", alerts_only):
                    with patch("services.scan_service._find_previous_scan", return_value=None):
                        with patch(
                            "services.scan_service._is_route_too_fast",
                            return_value=route_too_fast,
                        ):
                            with patch("services.scan_service._dispatch_email") as mock_dispatch:
                                result = process_scan(
                                    location="Cổng A",
                                    geo_status=geo_status,
                                    device_id="dev-1",
                                )
        return result, mock_dispatch

    def test_geo_ok_skips_email_when_alerts_only(self):
        result, dispatch = self._scan(geo_status="ok", alerts_only=True)
        assert result["status"] == "ok"
        dispatch.assert_not_called()
        assert "báo cáo tổng hợp" in result["message"]

    def test_out_of_range_emails_when_alerts_only(self):
        """Sai trạm (ngoài geofence) → gửi email cảnh báo."""
        result, dispatch = self._scan(geo_status="out_of_range", alerts_only=True)
        assert result["status"] == "ok"
        dispatch.assert_called_once()

    @pytest.mark.parametrize("geo_status", ["no_gps", "cached", "unverified"])
    def test_non_out_of_range_geo_skips_email_when_alerts_only(self, geo_status):
        """no_gps / cached / unverified KHÔNG còn là 'sai trạm' → không gửi email
        (trừ khi route quá nhanh)."""
        result, dispatch = self._scan(geo_status=geo_status, alerts_only=True)
        assert result["status"] == "ok"
        dispatch.assert_not_called()

    def test_route_too_fast_emails_even_when_geo_ok(self):
        """Thời gian di chuyển giữa 2 trạm quá nhanh → gửi email dù geo_status ok."""
        result, dispatch = self._scan(geo_status="ok", alerts_only=True, route_too_fast=True)
        assert result["status"] == "ok"
        dispatch.assert_called_once()

    def test_geo_ok_emails_when_alerts_only_off(self):
        """Mặc định (false) giữ hành vi cũ — mọi scan đều gửi email."""
        result, dispatch = self._scan(geo_status="ok", alerts_only=False)
        dispatch.assert_called_once()


class TestRouteTooFast:
    """_is_route_too_fast — đánh giá thời gian di chuyển giữa trạm trước và trạm
    hiện tại, dùng lại compute_route_assessment. Chỉ 'too_fast' tính là bất thường."""

    STATIONS = {
        "A": {"lat": 10.00, "lng": 106.00, "radius": 300},
        "B": {"lat": 10.05, "lng": 106.05, "radius": 300},  # ~7.8km đường chim bay
    }

    def test_no_previous_scan_is_not_too_fast(self):
        from services.scan_service import _is_route_too_fast
        from datetime import datetime, timezone
        now = datetime(2026, 6, 23, 8, 0, tzinfo=timezone.utc)
        assert _is_route_too_fast(None, None, "B", now) is False

    def test_normal_travel_time_not_too_fast(self):
        from services.scan_service import _is_route_too_fast
        from datetime import datetime, timezone, timedelta
        prev_dt = datetime(2026, 6, 23, 8, 0, tzinfo=timezone.utc)
        cur_dt = prev_dt + timedelta(minutes=40)  # đủ thời gian đi ~9km bằng xe đạp
        with patch("services.scan_service.get_stations", return_value=self.STATIONS):
            assert _is_route_too_fast("A", prev_dt, "B", cur_dt) is False

    def test_impossibly_fast_travel_is_too_fast(self):
        from services.scan_service import _is_route_too_fast
        from datetime import datetime, timezone, timedelta
        prev_dt = datetime(2026, 6, 23, 8, 0, tzinfo=timezone.utc)
        cur_dt = prev_dt + timedelta(minutes=1)  # ~9km trong 1 phút → bất khả thi
        with patch("services.scan_service.get_stations", return_value=self.STATIONS):
            assert _is_route_too_fast("A", prev_dt, "B", cur_dt) is True


class TestDedupe:
    """Chống duplicate: retry từ offline queue (timeout 8s) không tạo bản ghi thứ 2."""

    SCAN_KW = dict(
        location="Cổng A",
        device_id="dev-abc",
        scanned_at="2026-06-12T08:30:00+07:00",
    )

    def test_duplicate_returns_existing_scan_without_insert(self):
        from services.scan_service import process_scan
        existing = MagicMock()
        existing.id = 7
        existing.email_sent = True

        session = _make_session()
        session.query.return_value.filter.return_value.first.return_value = existing

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email") as mock_dispatch:
                result = process_scan(**self.SCAN_KW)

        assert result["status"] == "ok"
        assert result["deduped"] is True
        assert result["scan_id"] == 7
        assert result["email_sent"] is True
        session.add.assert_not_called()       # không insert bản thứ 2
        mock_dispatch.assert_not_called()     # không gửi email lần 2

    def test_no_device_id_skips_dedupe(self):
        """Không có device_id → không dedupe được, insert bình thường."""
        from services.scan_service import process_scan
        session = _make_session(scan_id=10)

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email"):
                result = process_scan(location="Cổng A")

        assert result["status"] == "ok"
        assert "deduped" not in result
        session.add.assert_called_once()

    def test_dedupe_checked_before_rate_limit(self):
        """Retry hợp lệ không được dính RATE_LIMITED — dedupe phải chạy trước."""
        from services.scan_service import process_scan
        existing = MagicMock()
        existing.id = 7
        existing.email_sent = True

        session = _make_session()
        session.query.return_value.filter.return_value.first.return_value = existing

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email"):
                with patch("services.scan_service.check_rate_limit") as mock_rate:
                    result = process_scan(**self.SCAN_KW)

        assert result["deduped"] is True
        mock_rate.assert_not_called()

    def test_integrity_error_race_returns_existing(self):
        """2 request trùng cùng lúc — unique index chặn bản 2 → trả bản đã lưu."""
        from services.scan_service import process_scan
        existing = MagicMock()
        existing.id = 9
        existing.email_sent = False

        session = _make_session()
        # Lần 1 (dedupe check đầu): chưa có; lần 2 (sau IntegrityError): thấy bản kia
        session.query.return_value.filter.return_value.first.side_effect = [None, existing]
        session.flush.side_effect = IntegrityError("stmt", {}, Exception("duplicate key"))

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_email") as mock_dispatch:
                with patch("services.scan_service.check_rate_limit", return_value=None):
                    result = process_scan(**self.SCAN_KW)

        assert result["status"] == "ok"
        assert result["deduped"] is True
        assert result["scan_id"] == 9
        session.rollback.assert_called_once()
        mock_dispatch.assert_not_called()
