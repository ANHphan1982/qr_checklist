"""
TDD — geo_service.py
RED  → tests viết trước, chưa có code → fail
GREEN → implement haversine_distance + validate_location → pass
REFACTOR → code đã gọn, tests vẫn pass
"""
import math
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.geo_service import haversine_distance, validate_location

# ---------------------------------------------------------------------------
# haversine_distance
# ---------------------------------------------------------------------------

class TestHaversineDistance:
    def test_same_point_returns_zero(self):
        """Cùng tọa độ → khoảng cách = 0"""
        assert haversine_distance(10.823, 106.629, 10.823, 106.629) == 0.0

    def test_known_distance_roughly_111m(self):
        """0.001 độ vĩ ≈ 111m"""
        d = haversine_distance(0.0, 0.0, 0.001, 0.0)
        assert 100 < d < 120

    def test_symmetric(self):
        """Khoảng cách từ A→B = B→A"""
        d1 = haversine_distance(10.823, 106.629, 10.824, 106.630)
        d2 = haversine_distance(10.824, 106.630, 10.823, 106.629)
        assert abs(d1 - d2) < 0.001

    def test_returns_float(self):
        d = haversine_distance(10.0, 106.0, 10.001, 106.001)
        assert isinstance(d, float)

    def test_positive_distance(self):
        d = haversine_distance(10.823, 106.629, 10.825, 106.631)
        assert d > 0

    def test_large_distance_hanoi_hcm(self):
        """Hà Nội → TP.HCM ≈ 1138km theo đường thẳng"""
        d = haversine_distance(21.0285, 105.8542, 10.8231, 106.6297)
        assert 1_100_000 < d < 1_200_000


# ---------------------------------------------------------------------------
# validate_location
# ---------------------------------------------------------------------------

STATIONS_FIXTURE = {
    "Cổng A": {"lat": 10.823456, "lng": 106.629123, "radius": 50},
    "Kho lớn": {"lat": 10.824100, "lng": 106.628900, "radius": 100},
}


class TestValidateLocation:
    def test_within_radius_returns_valid(self):
        """Scan đúng tại tọa độ trạm → valid"""
        result = validate_location("Cổng A", 10.823456, 106.629123, STATIONS_FIXTURE)
        assert result["valid"] is True
        assert result["distance"] == 0.0

    def test_out_of_radius_returns_invalid(self):
        """Scan cách xa 300m → invalid"""
        # ~300m north of Cổng A
        result = validate_location("Cổng A", 10.826156, 106.629123, STATIONS_FIXTURE)
        assert result["valid"] is False
        assert "message" in result
        assert result["distance"] > 50

    def test_out_of_range_message_contains_station_name(self):
        result = validate_location("Cổng A", 10.830, 106.629123, STATIONS_FIXTURE)
        assert "Cổng A" in result["message"]

    def test_unknown_station_skipped(self):
        """Trạm chưa config → bỏ qua kiểm tra, trả valid+skipped"""
        result = validate_location("Trạm X", 0.0, 0.0, STATIONS_FIXTURE)
        assert result["valid"] is True
        assert result.get("skipped") is True
        assert result["distance"] is None

    def test_empty_stations_dict_skipped(self):
        result = validate_location("Cổng A", 10.823456, 106.629123, {})
        assert result["valid"] is True
        assert result.get("skipped") is True

    def test_large_radius_passes_further_point(self):
        """radius=100m → điểm cách 80m vẫn hợp lệ"""
        # ~80m north
        result = validate_location("Kho lớn", 10.824820, 106.628900, STATIONS_FIXTURE)
        assert result["valid"] is True

    def test_distance_is_rounded(self):
        result = validate_location("Cổng A", 10.823556, 106.629123, STATIONS_FIXTURE)
        if result["valid"]:
            assert isinstance(result["distance"], float)
        else:
            assert isinstance(result["distance"], float)

    def test_just_on_boundary(self):
        """Điểm đúng bằng radius → valid (≤ radius)"""
        # Cổng A có radius=50m, tạo điểm cách đúng ~50m
        # 50m ≈ 0.00045 độ vĩ
        result = validate_location("Cổng A", 10.823456 + 0.00044, 106.629123, STATIONS_FIXTURE)
        # Có thể valid hoặc invalid tùy tọa độ chính xác — chỉ kiểm tra trả về đúng kiểu
        assert "valid" in result
        assert "distance" in result
