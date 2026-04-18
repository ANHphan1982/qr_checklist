"""
Regression tests cho bug: geo_status được set "ok" khi station không tồn tại trong config
(validate_location trả về skipped=True nhưng scan.py vẫn gán geo_status = "ok")
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.geo_service import validate_location

STATIONS = {
    "TK-5205A": {"lat": 15.409161, "lng": 108.812188, "radius": 300},
}

# Vị trí cách TK-5205A khoảng 32km (bug report từ user)
FAR_LAT = 15.12492   # 15°07'29.7"N
FAR_LNG = 108.78122  # 108°46'52.4"E


class TestGeoStatusSkippedBug:
    def test_unknown_station_returns_skipped_true(self):
        """TJ-5205A không có trong config → skipped=True, không phải valid=True thuần tuý"""
        result = validate_location("TJ-5205A", FAR_LAT, FAR_LNG, STATIONS)
        assert result.get("skipped") is True, "Station không tìm thấy phải trả skipped=True"
        assert result["valid"] is True  # valid về mặt kỹ thuật nhưng KHÔNG được xem là "ok"

    def test_known_station_far_away_returns_out_of_range(self):
        """TK-5205A trong config, scan từ 32km → invalid, không phải skipped"""
        result = validate_location("TK-5205A", FAR_LAT, FAR_LNG, STATIONS)
        assert result["valid"] is False
        assert result.get("skipped") is not True
        assert result["distance"] > 30_000  # > 30km

    def test_known_station_nearby_returns_ok_no_skipped(self):
        """Scan đúng tại TK-5205A → valid=True, skipped=False/None"""
        result = validate_location("TK-5205A", 15.409161, 108.812188, STATIONS)
        assert result["valid"] is True
        assert not result.get("skipped")

    def test_scan_route_geo_status_logic(self):
        """
        Regression: Mô phỏng logic trong scan.py sau khi fix.
        skipped=True → geo_status phải là 'no_gps', không phải 'ok'
        """
        geo_status = "no_gps"

        # Trường hợp: có GPS, trạm KHÔNG tồn tại trong config
        scan_lat, scan_lng = FAR_LAT, FAR_LNG
        geo_result = validate_location("TJ-5205A", scan_lat, scan_lng, STATIONS)

        if not geo_result["valid"]:
            geo_status = "out_of_range"
        elif not geo_result.get("skipped"):
            geo_status = "ok"
        # else: giữ nguyên "no_gps"

        assert geo_status == "no_gps", (
            f"Station không có trong config với GPS → geo_status phải là 'no_gps', got '{geo_status}'"
        )

    def test_scan_route_geo_status_out_of_range(self):
        """Trạm có trong config, scan từ xa → geo_status = out_of_range"""
        geo_status = "no_gps"

        scan_lat, scan_lng = FAR_LAT, FAR_LNG
        geo_result = validate_location("TK-5205A", scan_lat, scan_lng, STATIONS)

        if not geo_result["valid"]:
            geo_status = "out_of_range"
        elif not geo_result.get("skipped"):
            geo_status = "ok"

        assert geo_status == "out_of_range"

    def test_scan_route_geo_status_ok_when_valid(self):
        """Trạm có trong config, scan tại chỗ → geo_status = ok"""
        geo_status = "no_gps"

        scan_lat, scan_lng = 15.409161, 108.812188  # Đúng tại TK-5205A
        geo_result = validate_location("TK-5205A", scan_lat, scan_lng, STATIONS)

        if not geo_result["valid"]:
            geo_status = "out_of_range"
        elif not geo_result.get("skipped"):
            geo_status = "ok"

        assert geo_status == "ok"
