"""
TDD — Tank level param for 052-LI-042B (TK-5211A) + static-config protection in admin.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# 1. stations_config.py — STATION_PARAMS has TK-5211A
# ---------------------------------------------------------------------------
class TestStationParamsConfig:
    def test_station_params_exists(self):
        from services.stations_config import STATION_PARAMS
        assert isinstance(STATION_PARAMS, dict), "STATION_PARAMS phải là dict"

    def test_tk5211a_present(self):
        from services.stations_config import STATION_PARAMS
        assert "TK-5211A" in STATION_PARAMS, "STATION_PARAMS phải có 'TK-5211A'"

    def test_tk5211a_param_label(self):
        from services.stations_config import STATION_PARAMS
        assert STATION_PARAMS["TK-5211A"]["param_label"] == "Tank level"

    def test_tk5211a_param_unit(self):
        from services.stations_config import STATION_PARAMS
        assert STATION_PARAMS["TK-5211A"]["param_unit"] == "mm"

    def test_qr_alias_052_li_042b_maps_to_tk5211a(self):
        """Kiểm tra alias vẫn đúng: 052-LI-042B → TK-5211A."""
        from services.stations_config import QR_ALIAS_MAP
        assert QR_ALIAS_MAP.get("052-LI-042B") == "TK-5211A"


# ---------------------------------------------------------------------------
# 2. stations_db.get_station_params() — merge static + DB
# ---------------------------------------------------------------------------
class TestGetStationParams:
    def test_returns_static_when_db_empty(self):
        """Khi DB không có bản ghi, trả về static config TK-5211A."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = []

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        assert "TK-5211A" in result
        assert result["TK-5211A"]["param_label"] == "Tank level"
        assert result["TK-5211A"]["param_unit"] == "mm"

    def test_db_entry_overrides_static(self):
        """DB row thắng khi trùng station_name."""
        mock_row = MagicMock()
        mock_row.station_name = "TK-5211A"
        mock_row.param_label = "Mức tank"
        mock_row.param_unit = "cm"
        mock_row.active = True
        mock_row.id = 7

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = [mock_row]

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        assert result["TK-5211A"]["param_label"] == "Mức tank"
        assert result["TK-5211A"]["param_unit"] == "cm"

    def test_db_can_add_extra_stations(self):
        """DB có thể thêm trạm không có trong static config."""
        mock_row = MagicMock()
        mock_row.station_name = "TK-9999"
        mock_row.param_label = "Áp suất"
        mock_row.param_unit = "bar"
        mock_row.active = True
        mock_row.id = 99

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = [mock_row]

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        assert "TK-9999" in result
        assert "TK-5211A" in result  # static vẫn có mặt

    def test_fallback_to_static_when_db_error(self):
        """Khi DB lỗi, trả về static config."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.side_effect = Exception("DB down")

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        assert "TK-5211A" in result


# ---------------------------------------------------------------------------
# 3. Public GET /api/station-params — includes TK-5211A from static
# ---------------------------------------------------------------------------
class TestPublicStationParamsEndpoint:
    def test_get_station_params_includes_tk5211a(self, flask_app):
        """/api/station-params phải trả về TK-5211A (từ static config)."""
        static_data = {
            "TK-5211A": {"param_label": "Tank level", "param_unit": "mm", "active": True, "id": None}
        }
        with patch("routes.scan.get_station_params", return_value=static_data):
            client = flask_app.test_client()
            resp = client.get("/api/station-params")

        assert resp.status_code == 200
        configs = resp.get_json()["configs"]
        names = [c["station_name"] for c in configs]
        assert "TK-5211A" in names

    def test_get_station_params_returns_correct_labels(self, flask_app):
        """/api/station-params trả đúng param_label và param_unit."""
        static_data = {
            "TK-5211A": {"param_label": "Tank level", "param_unit": "mm", "active": True, "id": None}
        }
        with patch("routes.scan.get_station_params", return_value=static_data):
            client = flask_app.test_client()
            resp = client.get("/api/station-params")

        configs = resp.get_json()["configs"]
        tk = next(c for c in configs if c["station_name"] == "TK-5211A")
        assert tk["param_label"] == "Tank level"
        assert tk["param_unit"] == "mm"


# ---------------------------------------------------------------------------
# 4. Admin POST /admin/station-params — blocked for static-config stations
# ---------------------------------------------------------------------------
class TestAdminBlockStaticStationParam:
    def _make_admin_client(self, flask_app):
        from unittest.mock import patch as _patch
        return flask_app.test_client()

    def test_post_blocked_for_static_station(self, flask_app):
        """POST /admin/station-params với TK-5211A → 409 vì đã có trong config."""
        from config import ADMIN_SECRET as _sec
        static_params = {"TK-5211A": {"param_label": "Tank level", "param_unit": "mm"}}

        with patch("routes.admin.STATIC_STATION_PARAMS", static_params):
            with patch("routes.admin.ADMIN_SECRET", "test-secret"):
                client = flask_app.test_client()
                resp = client.post(
                    "/api/admin/station-params",
                    json={"station_name": "TK-5211A", "param_label": "Tank level", "param_unit": "mm"},
                    headers={"X-Admin-Key": "test-secret"},
                    content_type="application/json",
                )

        assert resp.status_code == 409
        assert "config" in resp.get_json().get("error", "").lower() or \
               "cấu hình sẵn" in resp.get_json().get("error", "")

    def test_post_allowed_for_non_static_station(self, flask_app):
        """POST với trạm không có trong static config → được phép (201)."""
        static_params = {"TK-5211A": {"param_label": "Tank level", "param_unit": "mm"}}

        mock_sp = MagicMock()
        mock_sp.id = 10
        mock_sp.station_name = "TK-9999"
        mock_sp.param_label = "Áp suất"
        mock_sp.param_unit = "bar"
        mock_sp.active = True
        mock_sp.to_dict.return_value = {
            "id": 10, "station_name": "TK-9999",
            "param_label": "Áp suất", "param_unit": "bar", "active": True,
        }

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        def fake_add(obj):
            obj.id = 10

        mock_session.add.side_effect = fake_add
        mock_session.refresh.side_effect = lambda obj: mock_sp.to_dict()

        with patch("routes.admin.STATIC_STATION_PARAMS", static_params):
            with patch("routes.admin.ADMIN_SECRET", "test-secret"):
                with patch("routes.admin.SessionLocal", return_value=mock_session):
                    client = flask_app.test_client()
                    resp = client.post(
                        "/api/admin/station-params",
                        json={"station_name": "TK-9999", "param_label": "Áp suất", "param_unit": "bar"},
                        headers={"X-Admin-Key": "test-secret"},
                        content_type="application/json",
                    )

        assert resp.status_code == 201

    def test_put_blocked_for_static_station(self, flask_app):
        """PUT /admin/station-params/<id> bị chặn nếu station thuộc static config."""
        static_params = {"TK-5211A": {"param_label": "Tank level", "param_unit": "mm"}}

        mock_sp = MagicMock()
        mock_sp.station_name = "TK-5211A"
        mock_sp.param_label = "Tank level"
        mock_sp.param_unit = "mm"
        mock_sp.active = True

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.get.return_value = mock_sp

        with patch("routes.admin.STATIC_STATION_PARAMS", static_params):
            with patch("routes.admin.ADMIN_SECRET", "test-secret"):
                with patch("routes.admin.SessionLocal", return_value=mock_session):
                    client = flask_app.test_client()
                    resp = client.put(
                        "/api/admin/station-params/1",
                        json={"param_label": "Mức tank"},
                        headers={"X-Admin-Key": "test-secret"},
                        content_type="application/json",
                    )

        assert resp.status_code == 409
