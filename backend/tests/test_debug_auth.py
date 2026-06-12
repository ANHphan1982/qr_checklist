"""
Auth cho debug endpoints — email-config/email-test cần X-Admin-Key,
connectivity vẫn public (frontend dùng cho nút "Test kết nối server").
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch

SECRET = "test-admin-secret"


class TestDebugEmailConfigAuth:
    def test_no_key_returns_401(self, flask_app):
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().get("/api/debug/email-config")
        assert resp.status_code == 401

    def test_wrong_key_returns_401(self, flask_app):
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().get(
                "/api/debug/email-config", headers={"X-Admin-Key": "wrong"},
            )
        assert resp.status_code == 401

    def test_correct_key_returns_200(self, flask_app):
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().get(
                "/api/debug/email-config", headers={"X-Admin-Key": SECRET},
            )
        assert resp.status_code == 200
        assert "email_from" in resp.get_json()

    def test_unconfigured_secret_returns_503(self, flask_app):
        with patch("routes.debug.ADMIN_SECRET", ""):
            resp = flask_app.test_client().get("/api/debug/email-config")
        assert resp.status_code == 503

    def test_non_ascii_key_returns_401_not_500(self, flask_app):
        """compare_digest với str non-ASCII sẽ TypeError — phải so sánh bytes."""
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().get(
                "/api/debug/email-config", headers={"X-Admin-Key": "khóa-sai"},
            )
        assert resp.status_code == 401


class TestDebugEmailTestAuth:
    def test_no_key_returns_401(self, flask_app):
        """Quan trọng nhất: không có key thì KHÔNG được gửi email (đốt quota Resend)."""
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            with patch("routes.debug.resend") as mock_resend:
                resp = flask_app.test_client().post("/api/debug/email-test")
        assert resp.status_code == 401
        mock_resend.Emails.send.assert_not_called()

    def test_wrong_key_returns_401(self, flask_app):
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().post(
                "/api/debug/email-test", headers={"X-Admin-Key": "wrong"},
            )
        assert resp.status_code == 401


class TestDebugConnectivityStaysPublic:
    def test_connectivity_no_key_returns_200(self, flask_app):
        """Frontend gọi endpoint này không có key — phải giữ public."""
        with patch("routes.debug.ADMIN_SECRET", SECRET):
            resp = flask_app.test_client().get("/api/debug/connectivity")
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True
