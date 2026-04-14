"""
TDD — qr_token_service + anti_fraud_service
"""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch


# ─────────────────────────────────────────────────────────────────────────────
# qr_token_service
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateToken:
    def test_returns_16_char_hex(self):
        from services.qr_token_service import generate_token
        t = generate_token("TK-5201A")
        assert len(t) == 16
        assert all(c in "0123456789abcdef" for c in t)

    def test_same_station_same_window_same_token(self):
        from services.qr_token_service import generate_token
        t1 = generate_token("TK-5201A", window=100)
        t2 = generate_token("TK-5201A", window=100)
        assert t1 == t2

    def test_different_stations_different_tokens(self):
        from services.qr_token_service import generate_token
        t1 = generate_token("TK-5201A", window=100)
        t2 = generate_token("TK-5203A", window=100)
        assert t1 != t2

    def test_different_windows_different_tokens(self):
        from services.qr_token_service import generate_token
        t1 = generate_token("TK-5201A", window=100)
        t2 = generate_token("TK-5201A", window=101)
        assert t1 != t2


class TestValidateToken:
    def test_valid_token_current_window(self):
        from services.qr_token_service import generate_token, validate_token, _current_window
        w = _current_window()
        token = generate_token("TK-5201A", w)
        assert validate_token("TK-5201A", token) is True

    def test_valid_token_previous_window(self):
        from services.qr_token_service import generate_token, validate_token, _current_window
        w = _current_window()
        token = generate_token("TK-5201A", w - 1)
        assert validate_token("TK-5201A", token) is True

    def test_expired_token_two_windows_ago(self):
        from services.qr_token_service import generate_token, validate_token, _current_window
        w = _current_window()
        token = generate_token("TK-5201A", w - 2)
        assert validate_token("TK-5201A", token) is False

    def test_wrong_station_invalid(self):
        from services.qr_token_service import generate_token, validate_token
        token = generate_token("TK-5201A")
        assert validate_token("TK-5203A", token) is False

    def test_empty_token_invalid(self):
        from services.qr_token_service import validate_token
        assert validate_token("TK-5201A", "") is False

    def test_none_token_invalid(self):
        from services.qr_token_service import validate_token
        assert validate_token("TK-5201A", None) is False

    def test_garbage_token_invalid(self):
        from services.qr_token_service import validate_token
        assert validate_token("TK-5201A", "aaaaaaaaaaaaaaaa") is False


class TestParseQrContent:
    def test_new_format_returns_station_and_token(self):
        from services.qr_token_service import parse_qr_content
        station, token = parse_qr_content("TK-5201A|abc123def456789a")
        assert station == "TK-5201A"
        assert token == "abc123def456789a"

    def test_old_format_returns_station_and_none(self):
        from services.qr_token_service import parse_qr_content
        station, token = parse_qr_content("TK-5201A")
        assert station == "TK-5201A"
        assert token is None

    def test_strips_whitespace(self):
        from services.qr_token_service import parse_qr_content
        station, token = parse_qr_content("  TK-5201A  |  abc123  ")
        assert station == "TK-5201A"
        assert token == "abc123"

    def test_pipe_in_token_ignored(self):
        from services.qr_token_service import parse_qr_content
        # Chỉ split lần đầu
        station, token = parse_qr_content("TK-5201A|token|extra")
        assert station == "TK-5201A"
        assert token == "token|extra"


class TestCurrentQrContent:
    def test_returns_required_keys(self):
        from services.qr_token_service import current_qr_content
        data = current_qr_content("TK-5201A")
        assert "qr_content" in data
        assert "station" in data
        assert "token" in data
        assert "expires_in" in data
        assert "window_seconds" in data

    def test_qr_content_format(self):
        from services.qr_token_service import current_qr_content
        data = current_qr_content("TK-5201A")
        assert data["qr_content"].startswith("TK-5201A|")
        assert data["station"] == "TK-5201A"

    def test_expires_in_within_window(self):
        from services.qr_token_service import current_qr_content
        data = current_qr_content("TK-5201A")
        assert 0 < data["expires_in"] <= data["window_seconds"]


# ─────────────────────────────────────────────────────────────────────────────
# anti_fraud_service
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckGpsEnforcement:
    def test_no_gps_require_false_passes(self, monkeypatch):
        monkeypatch.setattr("services.anti_fraud_service.REQUIRE_GPS", False)
        from services.anti_fraud_service import check_gps_enforcement
        assert check_gps_enforcement(None, None, None) is None

    def test_no_gps_require_true_fails(self, monkeypatch):
        monkeypatch.setattr("services.anti_fraud_service.REQUIRE_GPS", True)
        from services.anti_fraud_service import check_gps_enforcement
        result = check_gps_enforcement(None, None, None)
        assert result is not None
        assert result["code"] == "GPS_REQUIRED"

    def test_with_gps_require_true_passes(self, monkeypatch):
        monkeypatch.setattr("services.anti_fraud_service.REQUIRE_GPS", True)
        from services.anti_fraud_service import check_gps_enforcement
        assert check_gps_enforcement(10.823, 106.629, 5.0) is None


class TestCheckRateLimit:
    def _make_session(self, count):
        session = MagicMock()
        session.query.return_value.filter.return_value.scalar.return_value = count
        return session

    def test_under_limit_passes(self):
        from services.anti_fraud_service import check_rate_limit
        session = self._make_session(0)
        assert check_rate_limit(session, "device-1", "TK-5201A") is None

    def test_at_limit_blocked(self, monkeypatch):
        monkeypatch.setattr("services.anti_fraud_service.RATE_LIMIT_MAX_SCANS", 3)
        from services.anti_fraud_service import check_rate_limit
        session = self._make_session(3)
        result = check_rate_limit(session, "device-1", "TK-5201A")
        assert result is not None
        assert result["code"] == "RATE_LIMITED"

    def test_no_device_id_skips_check(self):
        from services.anti_fraud_service import check_rate_limit
        session = MagicMock()
        assert check_rate_limit(session, None, "TK-5201A") is None
        session.query.assert_not_called()
