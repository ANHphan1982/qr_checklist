"""
TDD — Operational params (Mức dầu mm) cho TK-5203A và TK-5205A
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch
from models import ScanLog


def _make_session(scan_id=99):
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    def flush_side_effect():
        session.add.call_args[0][0].id = scan_id

    session.flush.side_effect = flush_side_effect
    return session


# ---------------------------------------------------------------------------
# ScanLog model — oil_level_mm field
# ---------------------------------------------------------------------------
class TestScanLogModel:
    def test_has_oil_level_mm_column(self):
        """ScanLog phải có trường oil_level_mm."""
        assert hasattr(ScanLog, "oil_level_mm"), "ScanLog thiếu trường oil_level_mm"

    def test_to_dict_includes_oil_level_mm(self):
        """to_dict() phải trả về oil_level_mm."""
        log = ScanLog(location="TK-5203A")
        log.id = 1
        log.device_id = "dev"
        log.lat = None
        log.lng = None
        log.gps_accuracy = None
        log.geo_distance = None
        log.geo_status = "no_gps"
        log.token_valid = False
        log.scanned_at = None
        log.email_sent = False
        log.oil_level_mm = 1250.5
        d = log.to_dict()
        assert "oil_level_mm" in d
        assert d["oil_level_mm"] == 1250.5

    def test_to_dict_oil_level_mm_none_by_default(self):
        """to_dict() trả None khi oil_level_mm chưa được set."""
        log = ScanLog(location="Cổng A")
        log.id = 2
        log.device_id = None
        log.lat = None
        log.lng = None
        log.gps_accuracy = None
        log.geo_distance = None
        log.geo_status = "no_gps"
        log.token_valid = False
        log.scanned_at = None
        log.email_sent = False
        log.oil_level_mm = None
        d = log.to_dict()
        assert d.get("oil_level_mm") is None


# ---------------------------------------------------------------------------
# process_scan — nhận và lưu oil_level_mm
# ---------------------------------------------------------------------------
class TestProcessScanWithOilLevel:
    def test_saves_oil_level_mm_to_scanlog(self):
        """process_scan phải truyền oil_level_mm vào ScanLog."""
        session = _make_session(scan_id=10)
        saved_log = None

        original_add = session.add.side_effect

        def capture_add(obj):
            nonlocal saved_log
            saved_log = obj

        session.add.side_effect = capture_add

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=(True, "")):
                with patch("services.scan_service.check_rate_limit", return_value=None):
                    from services.scan_service import process_scan
                    result = process_scan(location="TK-5203A", oil_level_mm=1500.0)

        assert result["status"] == "ok"
        assert saved_log is not None
        assert saved_log.oil_level_mm == 1500.0

    def test_oil_level_mm_defaults_to_none(self):
        """Khi không truyền oil_level_mm, ScanLog.oil_level_mm = None."""
        session = _make_session(scan_id=11)
        saved_log = None

        def capture_add(obj):
            nonlocal saved_log
            saved_log = obj

        session.add.side_effect = capture_add

        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=(True, "")):
                with patch("services.scan_service.check_rate_limit", return_value=None):
                    from services.scan_service import process_scan
                    result = process_scan(location="Cổng A")

        assert result["status"] == "ok"
        assert saved_log is not None
        assert saved_log.oil_level_mm is None


# ---------------------------------------------------------------------------
# PATCH /api/scan/<id>/params route
# ---------------------------------------------------------------------------
class TestPatchScanParamsRoute:
    def test_patch_params_returns_200(self, flask_app):
        """PATCH /api/scan/<id>/params với oil_level_mm hợp lệ → 200."""
        mock_log = MagicMock()
        mock_log.id = 5

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.get.return_value = mock_log

        with patch("routes.scan.SessionLocal", return_value=mock_session):
            client = flask_app.test_client()
            resp = client.patch(
                "/api/scan/5/params",
                json={"oil_level_mm": 1250.5},
                content_type="application/json",
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"

    def test_patch_params_404_when_not_found(self, flask_app):
        """PATCH /api/scan/<id>/params trả 404 khi scan_id không tồn tại."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.get.return_value = None

        with patch("routes.scan.SessionLocal", return_value=mock_session):
            client = flask_app.test_client()
            resp = client.patch(
                "/api/scan/999/params",
                json={"oil_level_mm": 1250.5},
                content_type="application/json",
            )
        assert resp.status_code == 404
