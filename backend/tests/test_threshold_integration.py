"""
TDD — Tích hợp threshold alert vào process_scan và route PATCH params.

Khi thông số vượt ngưỡng:
  - process_scan (param_values gửi inline lúc scan)  → dispatch email cảnh báo
  - PATCH /scan/<id>/params (nhập qua modal sau scan) → dispatch email cảnh báo
Email cảnh báo LUÔN gửi, kể cả khi EMAIL_ALERTS_ONLY=true và geo_status=ok
(check-in thường bị bỏ email nhưng cảnh báo ngưỡng thì không).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import MagicMock, patch
from datetime import datetime, timezone


def _make_session(scan_id=30):
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    # MagicMock .first() mặc định truthy → process_scan tưởng là bản trùng (dedupe).
    # Set None tường minh để chạy nhánh insert bình thường (gotcha trong CLAUDE.md).
    session.query.return_value.filter.return_value.first.return_value = None
    # Truy vấn lần scan trước (route timing): .filter().order_by().first() → None
    # để không kích hoạt đánh giá tuyến trong các test threshold này.
    session.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    def flush_side_effect():
        session.add.call_args[0][0].id = scan_id

    session.flush.side_effect = flush_side_effect
    return session


def _breach_pv():
    return [{"tag": "P", "label": "Áp suất", "unit": "bar", "value": 1, "low": 5, "high": 10}]


def _ok_pv():
    return [{"tag": "P", "label": "Áp suất", "unit": "bar", "value": 7, "low": 5, "high": 10}]


class TestProcessScanThresholdAlert:
    def _run(self, param_values, geo_status="ok", alerts_only=False):
        session = _make_session(scan_id=30)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.EMAIL_ALERTS_ONLY", alerts_only):
                with patch("services.scan_service.check_rate_limit", return_value=None):
                    with patch("services.scan_service._dispatch_email"):
                        with patch("services.scan_service._dispatch_threshold_alert") as mock_alert:
                            from services.scan_service import process_scan
                            result = process_scan(
                                location="Trạm A", device_id="d1",
                                geo_status=geo_status, param_values=param_values,
                            )
        return result, mock_alert

    def test_breach_dispatches_alert(self):
        result, alert = self._run(_breach_pv())
        assert result["status"] == "ok"
        alert.assert_called_once()
        payload = alert.call_args[0][0]
        assert payload["location"] == "Trạm A"
        assert payload["device_id"] == "d1"
        assert len(payload["breaches"]) == 1
        assert payload["breaches"][0]["kind"] == "low"

    def test_normal_value_no_alert(self):
        result, alert = self._run(_ok_pv())
        alert.assert_not_called()

    def test_no_params_no_alert(self):
        result, alert = self._run(None)
        alert.assert_not_called()

    def test_alert_fires_even_when_alerts_only_and_geo_ok(self):
        """EMAIL_ALERTS_ONLY=true + geo ok: email check-in bị bỏ nhưng cảnh báo ngưỡng vẫn gửi."""
        result, alert = self._run(_breach_pv(), geo_status="ok", alerts_only=True)
        alert.assert_called_once()

    def test_response_reports_breach_count(self):
        result, _ = self._run(_breach_pv())
        assert result.get("threshold_breaches") == 1


class TestPatchRouteThresholdAlert:
    def _session(self, mock_log):
        s = MagicMock()
        s.__enter__ = MagicMock(return_value=s)
        s.__exit__ = MagicMock(return_value=False)
        s.get.return_value = mock_log
        return s

    def _recent_log(self):
        log = MagicMock()
        log.id = 5
        log.location = "Trạm B"
        log.device_id = "dev-9"
        log.created_at = datetime.now(timezone.utc)
        return log

    def test_patch_breach_dispatches_alert(self, flask_app):
        session = self._session(self._recent_log())
        with patch("routes.scan.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_threshold_alert") as mock_alert:
                resp = flask_app.test_client().patch(
                    "/api/scan/5/params",
                    json={"param_values": _breach_pv()},
                    content_type="application/json",
                )
        assert resp.status_code == 200
        mock_alert.assert_called_once()
        assert resp.get_json().get("threshold_breaches") == 1

    def test_patch_normal_value_no_alert(self, flask_app):
        session = self._session(self._recent_log())
        with patch("routes.scan.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_threshold_alert") as mock_alert:
                resp = flask_app.test_client().patch(
                    "/api/scan/5/params",
                    json={"param_values": _ok_pv()},
                    content_type="application/json",
                )
        assert resp.status_code == 200
        mock_alert.assert_not_called()

    def test_patch_oil_level_only_no_crash(self, flask_app):
        """PATCH chỉ oil_level_mm (không param_values) → không alert, không lỗi."""
        session = self._session(self._recent_log())
        with patch("routes.scan.SessionLocal", return_value=session):
            with patch("services.scan_service._dispatch_threshold_alert") as mock_alert:
                resp = flask_app.test_client().patch(
                    "/api/scan/5/params",
                    json={"oil_level_mm": 123.0},
                    content_type="application/json",
                )
        assert resp.status_code == 200
        mock_alert.assert_not_called()
