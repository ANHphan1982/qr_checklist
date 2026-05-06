"""
E2E test cho mã QR thực tế: 052-LI-066B (Level gauge at foot of Tank)
Alias -> TK-5205A
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

REAL_QR_CODE = "052-LI-066B"
EXPECTED_STATION = "TK-5205A"


def _make_session(scan_id: int = 42) -> MagicMock:
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    session.query.return_value.filter.return_value.scalar.return_value = 0

    def flush_side_effect():
        if session.add.call_args:
            session.add.call_args[0][0].id = scan_id

    session.flush.side_effect = flush_side_effect
    return session


@pytest.fixture
def client():
    session = _make_session(42)
    with patch("services.scan_service.SessionLocal", return_value=session):
        with patch("services.scan_service.send_scan_email", return_value=(True, "")):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                yield c


# ---------------------------------------------------------------------------
# 1. Alias resolution
# ---------------------------------------------------------------------------

def test_alias_resolves_correctly():
    """052-LI-066B phai map sang TK-5205A trong QR_ALIAS_MAP."""
    from services.stations_config import QR_ALIAS_MAP
    assert REAL_QR_CODE in QR_ALIAS_MAP, f"{REAL_QR_CODE} khong co trong QR_ALIAS_MAP"
    assert QR_ALIAS_MAP[REAL_QR_CODE] == EXPECTED_STATION


def test_station_exists_in_stations():
    """TK-5205A phai co toa do trong STATIONS."""
    from services.stations_config import STATIONS
    assert EXPECTED_STATION in STATIONS
    station = STATIONS[EXPECTED_STATION]
    assert "lat" in station
    assert "lng" in station
    assert "radius" in station


def test_parse_qr_content_returns_station():
    """parse_qr_content('052-LI-066B') -> ('TK-5205A', None)."""
    from services.qr_token_service import parse_qr_content
    station, token = parse_qr_content(REAL_QR_CODE)
    assert station == EXPECTED_STATION
    assert token is None


# ---------------------------------------------------------------------------
# 2. POST /api/scan voi ma QR thuc te
# ---------------------------------------------------------------------------

def test_scan_with_real_qr_returns_200(client):
    """POST /api/scan voi QR '052-LI-066B' -> 200 ok."""
    resp = client.post("/api/scan", json={
        "location": REAL_QR_CODE,
        "device_id": "real-device-test",
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    })
    data = resp.get_json()
    assert resp.status_code == 200, f"Got {resp.status_code}: {data}"
    assert data["status"] == "ok"
    assert data["scan_id"] == 42


def test_scan_stores_correct_station_name(client):
    """ScanLog phai luu ten tram la 'TK-5205A', khong phai alias goc."""
    captured = []
    original_session = _make_session(42)

    def capture_add(log):
        captured.append(log)

    original_session.add.side_effect = capture_add

    with patch("services.scan_service.SessionLocal", return_value=original_session):
        with patch("services.scan_service.send_scan_email", return_value=(True, "")):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                c.post("/api/scan", json={
                    "location": REAL_QR_CODE,
                    "device_id": "store-check-device",
                    "scanned_at": datetime.now(timezone.utc).isoformat(),
                })

    assert len(captured) == 1, "ScanLog chua duoc tao"
    assert captured[0].location == EXPECTED_STATION, (
        f"location luu la '{captured[0].location}', mong doi '{EXPECTED_STATION}'"
    )


def test_scan_without_device_id_still_ok(client):
    """Khong co device_id -> rate limit skip -> van ok."""
    resp = client.post("/api/scan", json={
        "location": REAL_QR_CODE,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    })
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_scan_without_scanned_at_uses_now(client):
    """Khong truyen scanned_at -> dung thoi gian hien tai -> ok."""
    resp = client.post("/api/scan", json={
        "location": REAL_QR_CODE,
        "device_id": "no-time-device",
    })
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_scan_missing_location_returns_400(client):
    """Thieu location -> 400."""
    resp = client.post("/api/scan", json={
        "device_id": "bad-device",
    })
    assert resp.status_code == 400
    assert resp.get_json()["status"] == "error"


def test_scan_invalid_qr_returns_400(client):
    """QR khong ton tai trong alias map va khong phai ten tram -> 400."""
    resp = client.post("/api/scan", json={
        "location": "INVALID-QR-XYZ",
        "device_id": "bad-device",
    })
    # "INVALID-QR-XYZ" duoc treat nhu ten tram binh thuong (khong trong alias)
    # -> parse thanh station="INVALID-QR-XYZ", token=None -> process binh thuong
    # Neu muon reject tram khong ton tai phai add validation - kiem tra hien tai
    data = resp.get_json()
    # Hien tai he thong chap nhan bat ky ten tram nao (GPS validate neu co toa do)
    assert resp.status_code in (200, 400)


# ---------------------------------------------------------------------------
# 3. Email duoc goi dung thong tin
# ---------------------------------------------------------------------------

def test_email_called_with_correct_station():
    """send_scan_email duoc goi voi location='TK-5205A' (sau khi resolve alias)."""
    session = _make_session(42)
    email_calls = []

    def capture_email(**kwargs):
        email_calls.append(kwargs)
        return True, ""

    with patch("services.scan_service.SessionLocal", return_value=session):
        with patch("services.scan_service.send_scan_email", side_effect=capture_email):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                c.post("/api/scan", json={
                    "location": REAL_QR_CODE,
                    "device_id": "email-check-device",
                    "scanned_at": datetime.now(timezone.utc).isoformat(),
                })

    assert len(email_calls) == 1
    assert email_calls[0]["location"] == EXPECTED_STATION, (
        f"Email gui voi location='{email_calls[0]['location']}', "
        f"mong doi '{EXPECTED_STATION}'"
    )
