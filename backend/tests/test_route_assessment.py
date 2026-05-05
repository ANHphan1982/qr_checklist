"""
TDD — services/route_assessment.compute_route_assessment

Đánh giá việc đi kiểm tra đúng các vị trí: tính khoảng cách giữa 2 checkpoint
liên tiếp (dựa vào GPS đã set trong stations config), thời gian di chuyển dự
kiến với vận tốc xe đạp + thời gian scan QR, so sánh với thời gian thực tế
giữa 2 lần scan.

Công thức thời gian tiêu chuẩn:
    expected_travel_min = distance / speed_kmh + scan_time_per_station_min

Output cho mỗi scan:
- distance_from_prev_m  (None nếu là scan đầu hoặc trạm thiếu lat/lng)
- expected_travel_min   (None nếu không tính được distance)
- actual_travel_min     (None nếu là scan đầu)
- assessment            "first" | "ok" | "too_fast" | "too_slow" | "skipped"

Ngưỡng đánh giá:
- too_fast: actual < 50% expected → có khả năng không đi thực tế
- too_slow: actual > 300% expected → dừng nghỉ lâu giữa 2 trạm
- ok: nằm giữa hai ngưỡng
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.route_assessment import (
    compute_route_assessment,
    BICYCLE_SPEED_KMH,
    SCAN_TIME_PER_STATION_MIN,
)


# ---------------------------------------------------------------------------
# Hằng số
# ---------------------------------------------------------------------------
class TestConstants:
    def test_default_bicycle_speed_is_12_kmh(self):
        """Vận tốc xe đạp thực tế khi đi kiểm tra ~12 km/h."""
        assert BICYCLE_SPEED_KMH == 12

    def test_default_scan_time_per_station_is_2_min(self):
        """Mỗi trạm tốn ~2 phút để scan QR + ghi nhận."""
        assert SCAN_TIME_PER_STATION_MIN == 2


# ---------------------------------------------------------------------------
# First scan / không có cặp để so sánh
# ---------------------------------------------------------------------------
class TestFirstScan:
    def test_single_scan_assessment_is_first(self):
        scans = [{"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"}]
        stations = {"A": {"lat": 10.0, "lng": 106.0}}
        result = compute_route_assessment(scans, stations)
        assert len(result) == 1
        assert result[0]["assessment"] == "first"
        assert result[0]["distance_from_prev_m"] is None
        assert result[0]["expected_travel_min"] is None
        assert result[0]["actual_travel_min"] is None

    def test_empty_scans_returns_empty(self):
        assert compute_route_assessment([], {}) == []


# ---------------------------------------------------------------------------
# Tính khoảng cách + thời gian dự kiến
# ---------------------------------------------------------------------------
class TestDistanceAndExpectedTime:
    def test_consecutive_scans_compute_distance(self):
        """A-B cách ~111m (0.001 deg latitude ≈ 111m)."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:00:30+00:00"},
        ]
        stations = {
            "A": {"lat": 10.000, "lng": 106.000},
            "B": {"lat": 10.001, "lng": 106.000},
        }
        result = compute_route_assessment(scans, stations)
        assert 100 < result[1]["distance_from_prev_m"] < 125

    def test_expected_time_uses_12kmh_plus_scan_time_default(self):
        """1000m với 12 km/h = 5 phút di chuyển + 2 phút scan = 7 phút."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:07:00+00:00"},
        ]
        stations = {
            "A": {"lat": 10.000, "lng": 106.000},
            "B": {"lat": 10.000, "lng": 106.00921},  # ~1000m east
        }
        result = compute_route_assessment(scans, stations)
        # 1000m / (12000m / 60min) + 2 = 5 + 2 = 7 phút
        assert result[1]["expected_travel_min"] == pytest.approx(7.0, abs=0.2)

    def test_actual_time_in_minutes(self):
        """Actual travel time tính đúng phút giữa 2 scan."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:05:00+00:00"},
        ]
        stations = {
            "A": {"lat": 10.0, "lng": 106.0},
            "B": {"lat": 10.001, "lng": 106.0},
        }
        result = compute_route_assessment(scans, stations)
        assert result[1]["actual_travel_min"] == pytest.approx(5.0, abs=0.05)

    def test_speed_kmh_override(self):
        """Cho phép override speed (ví dụ đi bộ 5km/h)."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:14:00+00:00"},
        ]
        stations = {
            "A": {"lat": 10.000, "lng": 106.000},
            "B": {"lat": 10.000, "lng": 106.00921},  # ~1000m
        }
        result = compute_route_assessment(scans, stations, speed_kmh=5)
        # 1000m / (5000/60) + 2 phút scan = 12 + 2 = 14 phút
        assert result[1]["expected_travel_min"] == pytest.approx(14.0, abs=0.5)

    def test_scan_time_min_override(self):
        """Cho phép override thời gian scan QR per station."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:08:00+00:00"},
        ]
        stations = {
            "A": {"lat": 10.000, "lng": 106.000},
            "B": {"lat": 10.000, "lng": 106.00921},  # ~1000m
        }
        # 1000m / (12000/60) + 3 phút scan = 5 + 3 = 8 phút
        result = compute_route_assessment(scans, stations, scan_time_min=3)
        assert result[1]["expected_travel_min"] == pytest.approx(8.0, abs=0.2)


# ---------------------------------------------------------------------------
# Phân loại assessment
# ---------------------------------------------------------------------------
class TestAssessmentClassification:
    def _make_scans(self, actual_minutes):
        from datetime import datetime, timedelta, timezone
        t0 = datetime(2026, 5, 5, 8, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(minutes=actual_minutes)
        return [
            {"location": "A", "scanned_at": t0.isoformat()},
            {"location": "B", "scanned_at": t1.isoformat()},
        ]

    # 1000m, expected 5 + 2 = 7 phút @ 12 km/h + 2 phút scan
    STATIONS = {
        "A": {"lat": 10.000, "lng": 106.000},
        "B": {"lat": 10.000, "lng": 106.00921},
    }

    def test_ok_when_actual_close_to_expected(self):
        """7 phút thực tế ≈ 7 phút dự kiến → ok."""
        result = compute_route_assessment(self._make_scans(7), self.STATIONS)
        assert result[1]["assessment"] == "ok"

    def test_ok_when_actual_in_normal_range(self):
        """4 phút → 4/7 ≈ 57% expected, vẫn nằm trong range 'ok'."""
        result = compute_route_assessment(self._make_scans(4), self.STATIONS)
        assert result[1]["assessment"] == "ok"

    def test_too_fast_when_actual_below_50_percent(self):
        """3 phút thực tế cho route 7 phút dự kiến (43%) → quá nhanh."""
        result = compute_route_assessment(self._make_scans(3), self.STATIONS)
        assert result[1]["assessment"] == "too_fast"

    def test_too_slow_when_actual_above_3x(self):
        """22 phút cho route 7 phút (314%) → dừng nghỉ lâu."""
        result = compute_route_assessment(self._make_scans(22), self.STATIONS)
        assert result[1]["assessment"] == "too_slow"

    def test_too_slow_at_exact_3x_boundary_excluded(self):
        """21 phút = 3x đúng, vẫn coi là 'ok' (chưa vượt threshold)."""
        result = compute_route_assessment(self._make_scans(21), self.STATIONS)
        assert result[1]["assessment"] == "ok"


# ---------------------------------------------------------------------------
# Edge cases: trạm thiếu coords, scan ra trạm chưa định nghĩa
# ---------------------------------------------------------------------------
class TestEdgeCases:
    def test_skipped_when_current_station_missing_coords(self):
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "UNKNOWN", "scanned_at": "2026-05-05T08:05:00+00:00"},
        ]
        stations = {"A": {"lat": 10.0, "lng": 106.0}}
        result = compute_route_assessment(scans, stations)
        assert result[1]["assessment"] == "skipped"
        assert result[1]["distance_from_prev_m"] is None
        assert result[1]["expected_travel_min"] is None
        # actual_travel_min vẫn tính được vì có scanned_at của cả 2 scan
        assert result[1]["actual_travel_min"] == pytest.approx(5.0, abs=0.05)

    def test_skipped_when_prev_station_missing_coords(self):
        scans = [
            {"location": "UNKNOWN", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "A", "scanned_at": "2026-05-05T08:05:00+00:00"},
        ]
        stations = {"A": {"lat": 10.0, "lng": 106.0}}
        result = compute_route_assessment(scans, stations)
        assert result[1]["assessment"] == "skipped"
        assert result[1]["distance_from_prev_m"] is None

    def test_zero_distance_between_same_station(self):
        """Scan trùng trạm — distance ≈ 0, expected ≈ 0 → mọi actual time đều 'too_slow'.
        Ở thực tế đây là re-scan, nên xử lý đặc biệt: distance < 1m → assessment='ok'."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "A", "scanned_at": "2026-05-05T08:01:00+00:00"},
        ]
        stations = {"A": {"lat": 10.0, "lng": 106.0}}
        result = compute_route_assessment(scans, stations)
        assert result[1]["assessment"] == "ok"
        assert result[1]["distance_from_prev_m"] == pytest.approx(0.0, abs=1.0)

    def test_preserves_original_scan_fields(self):
        """Kết quả phải giữ các field gốc (id, geo_status, ...) không drop."""
        scans = [
            {"id": 1, "location": "A", "scanned_at": "2026-05-05T08:00:00+00:00", "geo_status": "ok"},
            {"id": 2, "location": "B", "scanned_at": "2026-05-05T08:05:00+00:00", "geo_status": "no_gps"},
        ]
        stations = {
            "A": {"lat": 10.0, "lng": 106.0},
            "B": {"lat": 10.001, "lng": 106.0},
        }
        result = compute_route_assessment(scans, stations)
        assert result[0]["id"] == 1
        assert result[1]["geo_status"] == "no_gps"

    def test_invalid_scanned_at_returns_none_actual(self):
        """scanned_at không parse được → actual_travel_min = None, assessment='skipped'."""
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "not-a-timestamp"},
        ]
        stations = {
            "A": {"lat": 10.0, "lng": 106.0},
            "B": {"lat": 10.001, "lng": 106.0},
        }
        result = compute_route_assessment(scans, stations)
        assert result[1]["actual_travel_min"] is None
        assert result[1]["assessment"] == "skipped"


# ---------------------------------------------------------------------------
# Chuỗi 3+ scan — assessment cho mỗi cặp liên tiếp
# ---------------------------------------------------------------------------
class TestMultipleScans:
    def test_three_scans_assessed_as_pairs(self):
        scans = [
            {"location": "A", "scanned_at": "2026-05-05T08:00:00+00:00"},
            {"location": "B", "scanned_at": "2026-05-05T08:07:00+00:00"},
            {"location": "C", "scanned_at": "2026-05-05T08:14:00+00:00"},
        ]
        stations = {
            "A": {"lat": 10.000, "lng": 106.000},
            "B": {"lat": 10.000, "lng": 106.00921},  # +1km east of A
            "C": {"lat": 10.000, "lng": 106.01842},  # +1km east of B
        }
        result = compute_route_assessment(scans, stations)
        assert result[0]["assessment"] == "first"
        # 1km in 7 min @ 12km/h + 2 min scan = 7 min expected → ok
        assert result[1]["assessment"] == "ok"
        assert result[2]["assessment"] == "ok"
        # B's distance is from A, C's distance is from B (not from A)
        assert result[1]["distance_from_prev_m"] == pytest.approx(1015, abs=20)
        assert result[2]["distance_from_prev_m"] == pytest.approx(1015, abs=20)
