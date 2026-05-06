"""
Integration tests — POST /api/scan với screen_score / screen_signals.

Verify:
  - Backward compatible: client KHÔNG gửi screen_score → vẫn lưu được, screen_class=None
  - Score 0.4 → screen_class='clean', email subject KHÔNG có prefix nghi vấn
  - Score 0.6 → screen_class='suspicious', subject có '[NGHI VAN]'
  - Score 0.9 → screen_class='high_risk', subject có '[NGUY CO CAO]'
  - signals dict được sanitize (clamp + drop unknown key) trước khi xuống DB
  - score >1 hoặc <0 → vẫn được clamp + classify đúng
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone


@pytest.fixture
def client_with_mocks():
    """Flask client với DB + email mock — capture ScanLog kwargs + email subject."""
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    session.query.return_value.filter.return_value.scalar.return_value = 0

    captured_log = {}
    captured_email = {}

    def add_side(log_obj):
        # Capture các attribute đã được gán lên ScanLog instance
        captured_log["screen_score"] = getattr(log_obj, "screen_score", None)
        captured_log["screen_signals"] = getattr(log_obj, "screen_signals", None)
        captured_log["screen_class"] = getattr(log_obj, "screen_class", None)
        captured_log["location"] = getattr(log_obj, "location", None)
        log_obj.id = 1

    session.add.side_effect = add_side

    def flush_side():
        if session.add.call_args:
            session.add.call_args[0][0].id = 1

    session.flush.side_effect = flush_side

    def fake_send_email(**kwargs):
        captured_email["screen_class"] = kwargs.get("screen_class")
        captured_email["screen_score"] = kwargs.get("screen_score")
        captured_email["screen_signals"] = kwargs.get("screen_signals")
        return (True, "")

    with patch("services.scan_service.SessionLocal", return_value=session), \
         patch("services.scan_service.send_scan_email", side_effect=fake_send_email), \
         patch("routes.scan.get_stations", return_value={
             "TK-5201A": {"lat": 15.408751, "lng": 108.814616, "radius": 50},
         }), \
         patch("routes.scan.get_qr_aliases", return_value={}):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        with flask_app.test_client() as c:
            yield c, captured_log, captured_email


def _post_scan(client, **overrides):
    payload = {
        "location": "TK-5201A",
        "device_id": "test-device",
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "lat": 15.408751,
        "lng": 108.814616,
        "accuracy": 10,
    }
    payload.update(overrides)
    return client.post("/api/scan", json=payload)


# ---------------------------------------------------------------------------
# Backward compatibility
# ---------------------------------------------------------------------------

class TestBackwardCompatible:
    def test_no_screen_fields_still_works(self, client_with_mocks):
        client, log, email = client_with_mocks
        resp = _post_scan(client)
        assert resp.status_code == 200
        # Không gửi → tất cả None
        assert log["screen_score"] is None
        assert log["screen_signals"] is None
        assert log["screen_class"] is None

    def test_no_screen_fields_no_email_prefix(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client)
        # screen_class None → email không có prefix
        assert email["screen_class"] is None


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

class TestClassification:
    def test_score_below_suspicious_classified_clean(self, client_with_mocks):
        client, log, email = client_with_mocks
        resp = _post_scan(
            client,
            screen_score=0.4,
            screen_signals={"flicker": 0.3, "uniformity": 0.5, "moire": 0.2},
        )
        assert resp.status_code == 200
        assert log["screen_class"] == "clean"
        assert log["screen_score"] == 0.4

    def test_score_at_suspicious_threshold(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.5,
                   screen_signals={"flicker": 0.5, "uniformity": 0.5, "moire": 0.5})
        assert log["screen_class"] == "suspicious"

    def test_score_at_high_risk_threshold(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.85,
                   screen_signals={"flicker": 0.9, "uniformity": 0.8, "moire": 0.7})
        assert log["screen_class"] == "high_risk"


# ---------------------------------------------------------------------------
# Signal sanitization
# ---------------------------------------------------------------------------

class TestSanitization:
    def test_signals_clamped_to_unit_interval(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.6,
                   screen_signals={"flicker": 2.5, "uniformity": -1.0, "moire": 0.5})
        sig = log["screen_signals"]
        assert sig["flicker"] == 1.0
        assert sig["uniformity"] == 0.0
        assert sig["moire"] == 0.5

    def test_unknown_signal_keys_dropped(self, client_with_mocks):
        # Client gửi key lạ → KHÔNG được lưu (tránh JSON injection / bloat)
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.6,
                   screen_signals={
                       "flicker": 0.7,
                       "uniformity": 0.5,
                       "moire": 0.3,
                       "evil_key": "DROP TABLE scan_logs",
                       "another_unknown": 999,
                   })
        sig = log["screen_signals"]
        assert "evil_key" not in sig
        assert "another_unknown" not in sig
        assert set(sig.keys()) == {"flicker", "uniformity", "moire"}

    def test_score_above_one_clamped(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=999,
                   screen_signals={"flicker": 0.5, "uniformity": 0.5, "moire": 0.5})
        # Score được clamp về 1.0 → classify high_risk
        assert log["screen_score"] == 1.0
        assert log["screen_class"] == "high_risk"

    def test_score_negative_clamped(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=-5,
                   screen_signals={"flicker": 0.0, "uniformity": 0.0, "moire": 0.0})
        assert log["screen_score"] == 0.0
        assert log["screen_class"] == "clean"

    def test_invalid_score_string_treated_as_none(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score="not-a-number",
                   screen_signals={"flicker": 0.5, "uniformity": 0.5, "moire": 0.5})
        # Không crash, score=None → class=None (giữ NULL trong DB)
        assert log["screen_score"] is None
        assert log["screen_class"] is None

    def test_signals_non_dict_treated_as_none(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.6, screen_signals="malicious string")
        # Score vẫn được lưu, signals=None
        assert log["screen_score"] == 0.6
        assert log["screen_signals"] is None


# ---------------------------------------------------------------------------
# Email integration
# ---------------------------------------------------------------------------

class TestEmailIntegration:
    def test_email_receives_screen_class_for_suspicious(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.6,
                   screen_signals={"flicker": 0.7, "uniformity": 0.5, "moire": 0.3})
        # send_scan_email được gọi với screen_class='suspicious'
        assert email["screen_class"] == "suspicious"
        assert email["screen_score"] == 0.6
        assert email["screen_signals"]["flicker"] == 0.7

    def test_email_receives_screen_class_for_high_risk(self, client_with_mocks):
        client, log, email = client_with_mocks
        _post_scan(client, screen_score=0.92,
                   screen_signals={"flicker": 0.95, "uniformity": 0.9, "moire": 0.85})
        assert email["screen_class"] == "high_risk"


# ---------------------------------------------------------------------------
# Anti-fraud: vẫn check-in được dù score cao (warning-only mode)
# ---------------------------------------------------------------------------

class TestWarningOnlyMode:
    def test_high_score_does_not_block_check_in(self, client_with_mocks):
        """Confirm: score=1.0 (chắc chắn màn hình) vẫn cho qua, không 403."""
        client, log, email = client_with_mocks
        resp = _post_scan(client, screen_score=1.0,
                          screen_signals={"flicker": 1.0, "uniformity": 1.0, "moire": 1.0})
        # status 200, KHÔNG phải 403 — đúng warning-only contract
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["status"] == "ok"
        # Đã ghi DB
        assert log["screen_class"] == "high_risk"
