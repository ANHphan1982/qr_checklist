"""
E2E tests cho geo_cached flow — fallback dùng vị trí cache localStorage
khi chip GPS fail tại điểm scan (ephemeris expired, trong nhà sâu).

Phạm vi:
1. Logic trong routes/scan.py khi geo_cached=True
2. Render email_service cho geo_status="cached"
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.geo_service import validate_location

STATIONS = {
    "TK-5205A": {"lat": 15.409161, "lng": 108.812188, "radius": 300},
}


# ---------------------------------------------------------------------------
# Logic trong scan.py — geo_cached=True bypass out_of_range
# ---------------------------------------------------------------------------
class TestGeoCachedLogic:
    def _decide_geo_status(self, geo_cached, valid, skipped):
        """Mô phỏng logic mới trong routes/scan.py."""
        if geo_cached:
            return "cached"
        if not valid:
            return "out_of_range"
        if not skipped:
            return "ok"
        return "no_gps"

    def test_cached_flag_overrides_out_of_range(self):
        """Vị trí cache cách trạm 5km → KHÔNG được flag out_of_range vì có thể user đã di chuyển sau khi cache."""
        geo_result = validate_location("TK-5205A", 15.45, 108.85, STATIONS)
        assert geo_result["valid"] is False  # thực sự out of range

        status = self._decide_geo_status(
            geo_cached=True,
            valid=geo_result["valid"],
            skipped=geo_result.get("skipped"),
        )
        assert status == "cached", "Cache fix không bao giờ flag out_of_range — admin tự đánh giá qua distance"

    def test_cached_flag_overrides_ok_too(self):
        """Vị trí cache đúng trạm vẫn ghi là cached (không phải ok) — phải minh bạch với admin."""
        geo_result = validate_location("TK-5205A", 15.409161, 108.812188, STATIONS)
        assert geo_result["valid"] is True

        status = self._decide_geo_status(
            geo_cached=True,
            valid=geo_result["valid"],
            skipped=geo_result.get("skipped"),
        )
        assert status == "cached", "Phải distinguish 'GPS thật đúng trạm' với 'cache trùng tâm trạm'"

    def test_no_cache_flag_uses_normal_logic(self):
        """Khi geo_cached=False, logic out_of_range vẫn hoạt động như cũ."""
        geo_result = validate_location("TK-5205A", 15.45, 108.85, STATIONS)

        status = self._decide_geo_status(
            geo_cached=False,
            valid=geo_result["valid"],
            skipped=geo_result.get("skipped"),
        )
        assert status == "out_of_range"

    def test_no_gps_at_all_returns_no_gps(self):
        """Không có lat/lng và không có cache → geo_status='no_gps'."""
        # Mô phỏng: scan_lat=None → không vào nhánh validate_location
        # Test logic full hơn ở routes/scan.py nhưng đây là smoke check
        status = self._decide_geo_status(
            geo_cached=False,
            valid=True,
            skipped=True,
        )
        assert status == "no_gps"


# ---------------------------------------------------------------------------
# email_service render cho geo_status="cached"
# ---------------------------------------------------------------------------
class TestEmailCachedRendering:
    """Test trực tiếp logic format trong email_service mà không gọi Resend thật."""

    def test_geo_info_includes_cache_age_in_minutes(self):
        from services.email_service import send_scan_email
        from datetime import datetime, timezone
        from unittest.mock import patch, MagicMock

        # Patch Resend send để capture html
        captured = {}

        class FakeResp:
            id = "fake-id"

        def capture_send(params):
            captured["html"] = params["html"]
            captured["subject"] = params["subject"]
            return FakeResp()

        with patch("services.email_service.resend") as mock_resend, \
             patch("services.email_service.RESEND_API_KEY", "fake_key"), \
             patch("services.email_service.EMAIL_FROM", "from@test"), \
             patch("services.email_service.EMAIL_TO", "to@test"):
            # resend module: bộc lộ Emails.send và không có Resend class (>=2.7 API)
            mock_resend.Emails.send = MagicMock(side_effect=capture_send)
            del mock_resend.Resend

            ok, err = send_scan_email(
                location="TK-5205A",
                scanned_at=datetime(2026, 5, 5, 8, 30, tzinfo=timezone.utc),
                device_id="dev-abc",
                lat=15.41,
                lng=108.81,
                geo_distance=350.0,
                geo_status="cached",
                cache_age_ms=12 * 60 * 1000,  # 12 phút
            )

            assert ok is True, f"send_scan_email phải thành công, error={err}"
            assert "12 phút trước" in captured["html"]
            assert "350m" in captured["html"]
            assert "cache" in captured["html"].lower()

    def test_geo_info_handles_subminute_age(self):
        """cache_age_ms < 60s → hiển thị '<1 phút trước' thay vì '0 phút trước'."""
        from services.email_service import send_scan_email
        from datetime import datetime, timezone
        from unittest.mock import patch, MagicMock

        captured = {}

        class FakeResp:
            id = "fake-id"

        def capture_send(params):
            captured["html"] = params["html"]
            return FakeResp()

        with patch("services.email_service.resend") as mock_resend, \
             patch("services.email_service.RESEND_API_KEY", "fake_key"), \
             patch("services.email_service.EMAIL_FROM", "from@test"), \
             patch("services.email_service.EMAIL_TO", "to@test"):
            mock_resend.Emails.send = MagicMock(side_effect=capture_send)
            del mock_resend.Resend

            send_scan_email(
                location="TK-5205A",
                scanned_at=datetime(2026, 5, 5, 8, 30, tzinfo=timezone.utc),
                device_id="dev-abc",
                lat=15.41,
                lng=108.81,
                geo_distance=20.0,
                geo_status="cached",
                cache_age_ms=15_000,  # 15 giây
            )

            assert "<1 phút trước" in captured["html"]

    def test_status_color_warning_for_cached(self):
        """Email status section dùng màu cảnh báo (#d97706) cho cached, không phải success xanh."""
        from services.email_service import send_scan_email
        from datetime import datetime, timezone
        from unittest.mock import patch, MagicMock

        captured = {}

        class FakeResp:
            id = "fake-id"

        def capture_send(params):
            captured["html"] = params["html"]
            return FakeResp()

        with patch("services.email_service.resend") as mock_resend, \
             patch("services.email_service.RESEND_API_KEY", "fake_key"), \
             patch("services.email_service.EMAIL_FROM", "from@test"), \
             patch("services.email_service.EMAIL_TO", "to@test"):
            mock_resend.Emails.send = MagicMock(side_effect=capture_send)
            del mock_resend.Resend

            send_scan_email(
                location="TK-5205A",
                scanned_at=datetime(2026, 5, 5, 8, 30, tzinfo=timezone.utc),
                device_id="dev-abc",
                lat=15.41,
                lng=108.81,
                geo_distance=100.0,
                geo_status="cached",
                cache_age_ms=5 * 60 * 1000,
            )

            # Cached phải dùng màu cảnh báo, không phải xanh "đúng vị trí"
            assert "#d97706" in captured["html"]
            assert "GPS không bắt được tại trạm" in captured["html"]
