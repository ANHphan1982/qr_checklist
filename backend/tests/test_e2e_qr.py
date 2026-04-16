"""
E2E test: tự sinh QR token -> tạo PNG -> POST /api/scan -> kiểm tra response.

Chạy: python -m pytest tests/test_e2e_qr.py -v
Hoặc standalone: python tests/test_e2e_qr.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import qrcode
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Helper: sinh QR content hợp lệ cho test
# ---------------------------------------------------------------------------

def make_valid_qr_content(station: str = "TK-5201A") -> str:
    """Trả về 'STATION|TOKEN' với token hợp lệ tại thời điểm hiện tại."""
    from services.qr_token_service import generate_token
    token = generate_token(station)
    return f"{station}|{token}"


# ---------------------------------------------------------------------------
# Helper: tạo PNG từ QR content
# ---------------------------------------------------------------------------

def save_qr_png(content: str, filename: str) -> str:
    output_dir = os.path.join(
        os.path.dirname(__file__), "..", "..", "qr-generator", "output"
    )
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, filename)
    img = qrcode.make(content)
    img.save(path)
    return os.path.abspath(path)


# ---------------------------------------------------------------------------
# Helper: tạo mock session
# ---------------------------------------------------------------------------

def _make_session(scan_id: int = 999) -> MagicMock:
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    # check_rate_limit gọi session.query().filter().scalar() → phải trả về int
    session.query.return_value.filter.return_value.scalar.return_value = 0

    def flush_side_effect():
        if session.add.call_args:
            session.add.call_args[0][0].id = scan_id

    session.flush.side_effect = flush_side_effect
    return session


# ---------------------------------------------------------------------------
# Fixture: Flask test client + mock DB + mock email
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    session = _make_session(999)
    with patch("services.scan_service.SessionLocal", return_value=session):
        with patch("services.scan_service.send_scan_email", return_value=True):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                yield c


# ---------------------------------------------------------------------------
# Test 1: QR tĩnh (format cũ — tên trạm thuần)
# ---------------------------------------------------------------------------

class TestQrTinhFormat:
    def test_static_qr_accepted(self, client):
        """QR chứa tên trạm thuần -> hệ thống nhận (REQUIRE_ROTATING_QR=false)."""
        payload = {
            "location": "TK-5201A",
            "device_id": "e2e-test-device",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = client.post("/api/scan", json=payload)
        data = resp.get_json()
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {data}"
        assert data["status"] == "ok"

    def test_static_qr_via_alias(self, client):
        """QR alias '052-LI-022B' -> map sang 'TK-5201A' -> ok."""
        payload = {
            "location": "052-LI-022B",
            "device_id": "e2e-alias-device",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = client.post("/api/scan", json=payload)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Test 2: Rotating QR (format mới — tên|token)
# ---------------------------------------------------------------------------

class TestRotatingQrFormat:
    def test_valid_rotating_qr(self, client):
        """Token hợp lệ trong window hiện tại -> ok."""
        qr_content = make_valid_qr_content("TK-5201A")
        payload = {
            "location": qr_content,
            "device_id": "e2e-rotating-device",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = client.post("/api/scan", json=payload)
        data = resp.get_json()
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {data}"
        assert data["status"] == "ok"

    def test_expired_rotating_qr_still_accepted_when_not_required(self, client):
        """Khi REQUIRE_ROTATING_QR=false, QR hết hạn vẫn được chấp nhận."""
        from services.qr_token_service import generate_token, _current_window
        old_token = generate_token("TK-5201A", _current_window() - 10)
        payload = {
            "location": f"TK-5201A|{old_token}",
            "device_id": "e2e-expired-device",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        with patch("routes.scan.REQUIRE_ROTATING_QR", False):
            resp = client.post("/api/scan", json=payload)
        assert resp.status_code == 200

    def test_expired_rotating_qr_rejected_when_required(self, client):
        """Khi REQUIRE_ROTATING_QR=true, QR hết hạn bị từ chối."""
        from services.qr_token_service import generate_token, _current_window
        old_token = generate_token("TK-5201A", _current_window() - 10)
        payload = {
            "location": f"TK-5201A|{old_token}",
            "device_id": "e2e-expired-strict",
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
        with patch("routes.scan.REQUIRE_ROTATING_QR", True):
            resp = client.post("/api/scan", json=payload)
        assert resp.status_code == 403
        assert resp.get_json()["code"] == "INVALID_TOKEN"


# ---------------------------------------------------------------------------
# Test 3: Sinh file QR PNG thực tế
# ---------------------------------------------------------------------------

class TestQrPngGeneration:
    def test_generates_png_file(self):
        """Tạo file PNG từ QR content hợp lệ."""
        content = make_valid_qr_content("TK-5201A")
        path = save_qr_png(content, "TEST_TK-5201A_rotating.png")
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0

    def test_all_stations_png(self):
        """Sinh PNG rotating QR cho tất cả 10 trạm."""
        stations = [
            "TK-5201A", "TK-5203A", "TK-5207A", "TK-5205A", "TK-5211A",
            "TK-5214", "TK-5212A", "TK-5213A", "A-5205", "A-5250",
        ]
        for station in stations:
            content = make_valid_qr_content(station)
            path = save_qr_png(content, f"ROTATING_{station}.png")
            assert os.path.exists(path), f"Missing file for {station}"


# ---------------------------------------------------------------------------
# Standalone: chạy trực tiếp không cần pytest
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    print("=" * 60)
    print("E2E QR Test - Standalone mode")
    print("=" * 60)

    # 1. Sinh QR content
    content = make_valid_qr_content("TK-5201A")
    print(f"\n[1] QR content: {content}")

    # 2. Tạo PNG
    png_path = save_qr_png(content, "TEST_TK-5201A_rotating.png")
    print(f"[2] PNG saved: {png_path}")

    # 3. Gọi /api/scan qua Flask test client
    print("\n[3] POST /api/scan ...")
    session = _make_session(999)

    with patch("services.scan_service.SessionLocal", return_value=session):
        with patch("services.scan_service.send_scan_email", return_value=True):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            with flask_app.test_client() as c:
                resp = c.post("/api/scan", json={
                    "location": content,
                    "device_id": "standalone-test",
                    "scanned_at": datetime.now(timezone.utc).isoformat(),
                })
                data = resp.get_json()

    print(f"    HTTP Status : {resp.status_code}")
    print(f"    Response    : {json.dumps(data, ensure_ascii=False, indent=4)}")
    print()
    if resp.status_code == 200 and data.get("status") == "ok":
        print("PASS - E2E test OK!")
    else:
        print("FAIL - E2E test failed!")
    print("=" * 60)
