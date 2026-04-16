"""
E2E LIVE test — gọi thẳng vào Render production.
Chạy: python -m pytest tests/test_e2e_live.py -v -s

Yêu cầu: RENDER_URL set trong env hoặc hardcode bên dưới.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.getenv("RENDER_URL", "https://qr-checklist.onrender.com")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
REAL_QR  = "052-LI-066B"
EXPECTED_STATION = "TK-5205A"
DEVICE_ID = "e2e-live-test-device"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Origin": "https://qr-checklist-jet.vercel.app",
    })
    s.timeout = 45
    return s


# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------

def test_health(session):
    """Server phải đang sống."""
    r = session.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# 2. Reports trước khi scan — baseline
# ---------------------------------------------------------------------------

def test_reports_returns_json(session):
    """/api/reports trả về JSON hợp lệ."""
    r = session.get(f"{BASE_URL}/api/reports", params={"date": TODAY})
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "logs" in data
    assert "total" in data
    assert "date" in data


def test_reports_date_matches(session):
    """/api/reports trả về đúng ngày được yêu cầu."""
    r = session.get(f"{BASE_URL}/api/reports", params={"date": TODAY})
    assert r.json()["date"] == TODAY


# ---------------------------------------------------------------------------
# 3. Scan với mã QR thực tế
# ---------------------------------------------------------------------------

def test_scan_real_qr(session):
    """POST /api/scan với QR thực '052-LI-066B' -> 200 ok."""
    payload = {
        "location": REAL_QR,
        "device_id": DEVICE_ID,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
    r = session.post(f"{BASE_URL}/api/scan", json=payload)
    data = r.json()
    assert r.status_code == 200, f"Got {r.status_code}: {data}"
    assert data["status"] == "ok"
    assert "scan_id" in data
    # Lưu scan_id để dùng ở test sau
    test_scan_real_qr.scan_id = data["scan_id"]
    print(f"\n  scan_id={data['scan_id']} message={ascii(data['message'])}")


# ---------------------------------------------------------------------------
# 4. Verify scan xuất hiện trong reports
# ---------------------------------------------------------------------------

def test_scan_appears_in_reports(session):
    """Sau khi scan, /api/reports phải có record mới."""
    r = session.get(f"{BASE_URL}/api/reports", params={"date": TODAY})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1, "Chua co record nao trong reports"

    # Tìm record vừa scan
    matching = [
        log for log in data["logs"]
        if log["location"] == EXPECTED_STATION
        and log["device_id"] == DEVICE_ID
    ]
    assert len(matching) >= 1, (
        f"Khong tim thay record location='{EXPECTED_STATION}' "
        f"device_id='{DEVICE_ID}' trong {data['logs']}"
    )


def test_scan_log_has_correct_fields(session):
    """Record trong reports phai co du cac truong can thiet."""
    r = session.get(f"{BASE_URL}/api/reports", params={"date": TODAY})
    data = r.json()
    matching = [
        log for log in data["logs"]
        if log["location"] == EXPECTED_STATION and log["device_id"] == DEVICE_ID
    ]
    assert matching, "Khong co record de kiem tra"
    log = matching[-1]

    assert log["location"] == EXPECTED_STATION
    assert log["device_id"] == DEVICE_ID
    assert log["scanned_at"] is not None
    assert "email_sent" in log
    assert "id" in log
    print(f"\n  log={ascii(str(log))}")


# ---------------------------------------------------------------------------
# 5. Edge cases
# ---------------------------------------------------------------------------

def test_scan_missing_location_returns_400(session):
    """Thieu location -> 400."""
    r = session.post(f"{BASE_URL}/api/scan", json={"device_id": "bad"})
    assert r.status_code == 400
    assert r.json()["status"] == "error"


def test_reports_invalid_date_returns_400(session):
    """Date sai format -> 400."""
    r = session.get(f"{BASE_URL}/api/reports", params={"date": "16-04-2026"})
    assert r.status_code == 400
    assert r.json()["status"] == "error"


def test_scan_static_station_name(session):
    """QR chua ten tram truc tiep (khong qua alias) -> ok."""
    r = session.post(f"{BASE_URL}/api/scan", json={
        "location": "TK-5201A",
        "device_id": "e2e-direct-station",
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    })
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
