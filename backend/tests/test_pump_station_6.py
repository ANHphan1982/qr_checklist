"""
Regression: trạm PUMP_STATION_6 chỉ tồn tại trong DB (admin cấu hình) nhưng
KHÔNG có trong static config (stations_config.py). Khi DB ngủ / cold-start
(Supabase free tier, Render free tier) → get_stations() fallback về static →
PUMP_STATION_6 biến mất → geofence không xác thực được → scan không hiện
"Đúng trạm", bị ghi nhận là unverified/no_gps.

Fix: đưa PUMP_STATION_6 vào static config (tọa độ + alias 052-PG-038) để luôn
được nhận diện kể cả khi DB không khả dụng.

Tọa độ thật (admin đã cấu hình): 15.409996, 108.814195, r=50m
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

from services.stations_config import STATIONS, QR_ALIAS_MAP
from services.geo_service import validate_location

PUMP6_LAT = 15.409996
PUMP6_LNG = 108.814195

# Vị trí cách trạm ~32km (mô phỏng scan từ xa / gian lận)
FAR_LAT = 15.12492
FAR_LNG = 108.78122


class TestStaticConfigHasPumpStation6:
    def test_pump_station_6_in_static_stations(self):
        """PUMP_STATION_6 phải có trong STATIONS với tọa độ admin đã cấu hình."""
        assert "PUMP_STATION_6" in STATIONS, (
            "PUMP_STATION_6 thiếu trong static config — DB ngủ sẽ làm trạm biến mất"
        )
        st = STATIONS["PUMP_STATION_6"]
        assert st["lat"] == pytest.approx(PUMP6_LAT, abs=1e-5)
        assert st["lng"] == pytest.approx(PUMP6_LNG, abs=1e-5)
        assert st["radius"] == 50

    def test_alias_052_pg_038_maps_to_pump_station_6(self):
        """QR dán tại trạm '052-PG-038' phải resolve về PUMP_STATION_6."""
        assert QR_ALIAS_MAP.get("052-PG-038") == "PUMP_STATION_6"


class TestGeofenceWorksFromStaticConfigOnly:
    """
    Mô phỏng DB không khả dụng: chỉ còn static STATIONS.
    Scan tại đúng trạm → 'ok'; scan từ xa → 'out_of_range' (không phải unverified/no_gps).
    """

    def test_validate_at_station_is_valid_not_skipped(self):
        result = validate_location("PUMP_STATION_6", PUMP6_LAT, PUMP6_LNG, STATIONS)
        assert result["valid"] is True
        assert not result.get("skipped"), (
            "PUMP_STATION_6 có trong static config → không được skip geofence"
        )

    def test_validate_far_away_is_out_of_range(self):
        result = validate_location("PUMP_STATION_6", FAR_LAT, FAR_LNG, STATIONS)
        assert result["valid"] is False
        assert not result.get("skipped")
        assert result["distance"] > 30_000


class TestRouteScanPumpStation6StaticOnly:
    """
    Route-level: POST /api/scan với 052-PG-038, GPS có, get_stations() chỉ trả
    về static config (DB down). Trước fix: 'unverified'. Sau fix: 'ok'/'out_of_range'.
    """

    @pytest.fixture
    def client_static_only(self):
        session = MagicMock()
        session.__enter__ = MagicMock(return_value=session)
        session.__exit__ = MagicMock(return_value=False)
        session.query.return_value.filter.return_value.scalar.return_value = 0

        def flush_side():
            if session.add.call_args:
                session.add.call_args[0][0].id = 1

        session.flush.side_effect = flush_side

        # get_stations / get_qr_aliases trả về CHÍNH static config (mô phỏng DB down)
        with patch("services.scan_service.SessionLocal", return_value=session), \
             patch("services.scan_service.send_scan_email", return_value=True), \
             patch("routes.scan.get_stations", return_value=dict(STATIONS)), \
             patch("routes.scan.get_qr_aliases", return_value=dict(QR_ALIAS_MAP)):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                yield c

    def test_scan_at_station_geo_status_ok(self, client_static_only):
        captured = {}

        def spy_process_scan(**kwargs):
            captured["geo_status"] = kwargs.get("geo_status")
            return {"status": "ok", "scan_id": 1, "message": "ok"}

        with patch("routes.scan.process_scan", side_effect=spy_process_scan):
            resp = client_static_only.post("/api/scan", json={
                "location": "052-PG-038",
                "device_id": "test-device",
                "lat": PUMP6_LAT,
                "lng": PUMP6_LNG,
                "accuracy": 15,
                "scanned_at": datetime.now(timezone.utc).isoformat(),
            })

        assert resp.status_code == 200, f"Unexpected: {resp.get_json()}"
        assert captured.get("geo_status") == "ok", (
            f"Scan tại đúng PUMP_STATION_6 (static config) → phải 'ok', "
            f"got '{captured.get('geo_status')}'"
        )

    def test_scan_far_geo_status_out_of_range(self, client_static_only):
        captured = {}

        def spy_process_scan(**kwargs):
            captured["geo_status"] = kwargs.get("geo_status")
            return {"status": "ok", "scan_id": 1, "message": "ok"}

        with patch("routes.scan.process_scan", side_effect=spy_process_scan):
            resp = client_static_only.post("/api/scan", json={
                "location": "052-PG-038",
                "device_id": "test-device",
                "lat": FAR_LAT,
                "lng": FAR_LNG,
                "accuracy": 15,
                "scanned_at": datetime.now(timezone.utc).isoformat(),
            })

        # out_of_range → route trả 403 (đã lưu DB) nhưng process_scan vẫn nhận đúng status
        assert captured.get("geo_status") == "out_of_range", (
            f"Scan từ xa PUMP_STATION_6 → phải 'out_of_range', "
            f"got '{captured.get('geo_status')}'"
        )
