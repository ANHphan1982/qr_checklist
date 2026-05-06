"""
Regression tests cho bug: geo_status được set "ok" khi station không tồn tại trong config
(validate_location trả về skipped=True nhưng scan.py vẫn gán geo_status = "ok")

Cập nhật: thêm test cho bug mới — geo_status "no_gps" khi GPS có nhưng trạm chưa config
(skipped=True + GPS present → phải là "unverified", không phải "no_gps")
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone
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
        skipped=True + GPS có → geo_status phải là 'unverified', không phải 'ok' hoặc 'no_gps'.
        """
        geo_status = "no_gps"

        # Trường hợp: có GPS, trạm KHÔNG tồn tại trong config
        scan_lat, scan_lng = FAR_LAT, FAR_LNG
        geo_result = validate_location("TJ-5205A", scan_lat, scan_lng, STATIONS)

        if not geo_result["valid"]:
            geo_status = "out_of_range"
        elif geo_result.get("skipped"):
            geo_status = "unverified"
        else:
            geo_status = "ok"

        assert geo_status == "unverified", (
            f"Station không có trong config nhưng GPS có → geo_status phải là 'unverified', got '{geo_status}'"
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


class TestGeoStatusUnverifiedBug:
    """
    Regression: trạm mới nhập (alias trỏ tới tên chưa có trong STATIONS) +
    GPS thiết bị CÓ gửi → geo_status phải là 'unverified', không phải 'no_gps'.

    Bug gốc: 'no_gps' ngụ ý thiết bị không gửi GPS. Nhưng ở đây thiết bị ĐÃ
    gửi lat/lng — vấn đề là trạm chưa có tọa độ để so sánh.
    Trường hợp thực tế: admin thêm alias 052-PG-038 → PUMP_STATION_6, nhưng
    chưa thêm PUMP_STATION_6 vào bảng stations với lat/lng.
    """

    # Tọa độ GPS giả lập từ thiết bị — quan trọng: KHÔNG phải None
    DEVICE_LAT = 15.12492
    DEVICE_LNG = 108.78122

    def test_geo_status_unverified_when_station_not_in_config_but_gps_present(self):
        """
        RED: GPS có → scan_lat/lng không phải None, nhưng trạm không có trong STATIONS.
        Kết quả MONG ĐỢI: 'unverified' (không phải 'no_gps').
        """
        geo_status = "no_gps"
        scan_lat, scan_lng = self.DEVICE_LAT, self.DEVICE_LNG

        geo_result = validate_location("PUMP_STATION_6", scan_lat, scan_lng, STATIONS)

        # Logic hiện tại trong scan.py (sau khi fix):
        if not geo_result["valid"]:
            geo_status = "out_of_range"
        elif geo_result.get("skipped") and scan_lat is not None:
            geo_status = "unverified"
        elif not geo_result.get("skipped"):
            geo_status = "ok"

        assert geo_status == "unverified", (
            f"GPS có nhưng trạm chưa config → geo_status phải là 'unverified', got '{geo_status}'"
        )

    def test_no_gps_only_when_device_sends_no_coordinates(self):
        """'no_gps' phải được đặt khi và chỉ khi thiết bị không gửi lat/lng."""
        scan_lat, scan_lng = None, None  # Thiết bị không có GPS

        geo_status = "no_gps"
        if scan_lat is not None and scan_lng is not None:
            geo_result = validate_location("PUMP_STATION_6", scan_lat, scan_lng, STATIONS)
            if not geo_result["valid"]:
                geo_status = "out_of_range"
            elif geo_result.get("skipped") and scan_lat is not None:
                geo_status = "unverified"
            elif not geo_result.get("skipped"):
                geo_status = "ok"

        assert geo_status == "no_gps"

    def test_pump_station_6_alias_scan_gets_unverified_not_no_gps(self):
        """
        Mô phỏng đúng flow: 052-PG-038 → alias → PUMP_STATION_6 → không có trong STATIONS.
        GPS thiết bị có: geo_status phải là 'unverified'.
        """
        # Sau khi parse alias, location = "PUMP_STATION_6"
        location = "PUMP_STATION_6"
        scan_lat, scan_lng = self.DEVICE_LAT, self.DEVICE_LNG

        geo_status = "no_gps"
        if scan_lat is not None and scan_lng is not None:
            geo_result = validate_location(location, scan_lat, scan_lng, STATIONS)
            if not geo_result["valid"]:
                geo_status = "out_of_range"
            elif geo_result.get("skipped") and scan_lat is not None:
                geo_status = "unverified"
            elif not geo_result.get("skipped"):
                geo_status = "ok"

        assert geo_status == "unverified", (
            "052-PG-038 alias scan với GPS → geo_status phải 'unverified'"
        )


class TestGeoStatusRouteLevel:
    """
    Route-level: gọi thực sự POST /api/scan, intercept process_scan để kiểm tra
    geo_status nào được truyền vào — đây là test RED thực sự trước khi fix scan.py.
    """

    @pytest.fixture
    def client_with_mocked_station(self):
        """
        Flask test client với:
          - get_stations() trả về STATIONS không có PUMP_STATION_6
          - get_qr_aliases() trả về alias 052-PG-038 → PUMP_STATION_6
          - process_scan bị spy để capture geo_status argument
          - DB và email mock để không gọi thật
        """
        session = MagicMock()
        session.__enter__ = MagicMock(return_value=session)
        session.__exit__ = MagicMock(return_value=False)
        session.query.return_value.filter.return_value.scalar.return_value = 0

        def flush_side():
            if session.add.call_args:
                session.add.call_args[0][0].id = 1

        session.flush.side_effect = flush_side

        with patch("services.scan_service.SessionLocal", return_value=session), \
             patch("services.scan_service.send_scan_email", return_value=True), \
             patch("routes.scan.get_stations", return_value={
                 # PUMP_STATION_6 KHÔNG có trong danh sách này
                 "TK-5201A": {"lat": 15.408751, "lng": 108.814616, "radius": 50},
             }), \
             patch("routes.scan.get_qr_aliases", return_value={
                 "052-PG-038": "PUMP_STATION_6",
                 "52-PG-071":  "PUMP_STATION_7",
             }):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                yield c

    def test_route_geo_status_unverified_for_unconfigured_station_with_gps(
        self, client_with_mocked_station
    ):
        """
        RED test: scan 052-PG-038 (alias → PUMP_STATION_6, chưa có tọa độ) với GPS.
        Trước khi fix scan.py: process_scan nhận geo_status='no_gps' → SAI.
        Sau khi fix scan.py:   process_scan nhận geo_status='unverified' → ĐÚNG.
        """
        captured = {}

        original_process = None

        def spy_process_scan(**kwargs):
            captured["geo_status"] = kwargs.get("geo_status")
            # Trả về giá trị đủ để route không crash
            return {"status": "ok", "scan_id": 1, "message": "ok"}

        with patch("routes.scan.process_scan", side_effect=spy_process_scan):
            resp = client_with_mocked_station.post("/api/scan", json={
                "location": "052-PG-038",
                "device_id": "test-device",
                "lat": 15.12492,
                "lng": 108.78122,
                "accuracy": 15,
                "scanned_at": datetime.now(timezone.utc).isoformat(),
            })

        assert resp.status_code == 200, f"Unexpected: {resp.get_json()}"
        assert captured.get("geo_status") == "unverified", (
            f"GPS có + PUMP_STATION_6 chưa config → geo_status phải 'unverified', "
            f"got '{captured.get('geo_status')}'"
        )

    def test_route_geo_status_no_gps_when_no_coordinates_sent(
        self, client_with_mocked_station
    ):
        """Khi không gửi lat/lng → geo_status vẫn là 'no_gps'."""
        captured = {}

        def spy_process_scan(**kwargs):
            captured["geo_status"] = kwargs.get("geo_status")
            return {"status": "ok", "scan_id": 1, "message": "ok"}

        with patch("routes.scan.process_scan", side_effect=spy_process_scan):
            resp = client_with_mocked_station.post("/api/scan", json={
                "location": "052-PG-038",
                "device_id": "test-device",
                "scanned_at": datetime.now(timezone.utc).isoformat(),
                # lat/lng KHÔNG được gửi
            })

        assert resp.status_code == 200
        assert captured.get("geo_status") == "no_gps", (
            f"Không có GPS → geo_status phải 'no_gps', got '{captured.get('geo_status')}'"
        )
