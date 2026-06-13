"""
TDD — GET /api/dashboard

Trả analytics tổng hợp cho cửa sổ N ngày gần nhất (mặc định 7, clamp 1..90).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import MagicMock, patch


class _FakeLog:
    def __init__(self, d):
        self._d = d

    def to_dict(self):
        return self._d


def _session_with_logs(dicts):
    """Mock session: query(...).filter(...).order_by(...).all() → fake logs."""
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    chain = session.query.return_value.filter.return_value.order_by.return_value
    chain.all.return_value = [_FakeLog(d) for d in dicts]
    return session


def _sample_logs():
    return [
        {"id": 1, "location": "A", "device_id": "d1", "geo_status": "ok",
         "scanned_at": "2026-06-13T01:00:00Z", "param_values": [
             {"tag": "TK-1", "label": "Mức dầu", "unit": "mm", "value": 100, "low": 50, "high": 200}]},
        {"id": 2, "location": "A", "device_id": "d1", "geo_status": "out_of_range",
         "scanned_at": "2026-06-13T02:00:00Z", "param_values": [
             {"tag": "TK-1", "label": "Mức dầu", "unit": "mm", "value": 80, "low": 50, "high": 200}]},
    ]


class TestDashboardRoute:
    def test_returns_503_when_db_not_configured(self, flask_app):
        with patch("routes.dashboard.SessionLocal", None):
            resp = flask_app.test_client().get("/api/dashboard")
        assert resp.status_code == 503

    def test_returns_200_with_sections(self, flask_app):
        session = _session_with_logs(_sample_logs())
        with patch("routes.dashboard.SessionLocal", return_value=session):
            resp = flask_app.test_client().get("/api/dashboard?days=7")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] == 2
        assert len(data["heatmap"]) == 24
        assert data["geo"]["counts"]["out_of_range"] == 1
        assert data["stations"][0]["station"] == "A"
        assert data["param_trends"][0]["direction"] == "down"
        assert data["days"] == 7

    def test_invalid_days_returns_400(self, flask_app):
        session = _session_with_logs([])
        with patch("routes.dashboard.SessionLocal", return_value=session):
            resp = flask_app.test_client().get("/api/dashboard?days=abc")
        assert resp.status_code == 400

    def test_zero_or_negative_days_returns_400(self, flask_app):
        session = _session_with_logs([])
        with patch("routes.dashboard.SessionLocal", return_value=session):
            resp = flask_app.test_client().get("/api/dashboard?days=0")
        assert resp.status_code == 400

    def test_days_clamped_to_max_90(self, flask_app):
        session = _session_with_logs([])
        with patch("routes.dashboard.SessionLocal", return_value=session):
            resp = flask_app.test_client().get("/api/dashboard?days=9999")
        assert resp.status_code == 200
        assert resp.get_json()["days"] == 90

    def test_default_days_is_7(self, flask_app):
        session = _session_with_logs([])
        with patch("routes.dashboard.SessionLocal", return_value=session):
            resp = flask_app.test_client().get("/api/dashboard")
        assert resp.status_code == 200
        assert resp.get_json()["days"] == 7
