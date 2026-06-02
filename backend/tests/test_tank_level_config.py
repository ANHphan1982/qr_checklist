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
# 2. stations_db.get_station_params() — merge static + DB (shape grouped multi-param)
#    Trả về {station_name: {station_name, params: [ {...}, ... ]}}
# ---------------------------------------------------------------------------
class TestGetStationParams:
    def test_returns_static_when_db_empty(self):
        """Khi DB không có bản ghi, trả về static config TK-5211A (1 thông số)."""
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = []

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        assert "TK-5211A" in result
        params = result["TK-5211A"]["params"]
        assert params[0]["param_label"] == "Tank level"
        assert params[0]["param_unit"] == "mm"

    def test_db_entry_overrides_static(self):
        """DB row thắng khi trùng station_name."""
        mock_row = MagicMock()
        mock_row.station_name = "TK-5211A"
        mock_row.tag = None
        mock_row.param_label = "Mức tank"
        mock_row.param_unit = "cm"
        mock_row.param_low = None
        mock_row.param_high = None
        mock_row.sort_order = 0
        mock_row.active = True
        mock_row.id = 7

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = [mock_row]

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        params = result["TK-5211A"]["params"]
        assert params[0]["param_label"] == "Mức tank"
        assert params[0]["param_unit"] == "cm"

    def test_db_multiple_params_per_station(self):
        """Một trạm có thể có NHIỀU thông số (sắp theo sort_order)."""
        def _row(station, tag, label, order, rid):
            r = MagicMock()
            r.station_name = station
            r.tag = tag
            r.param_label = label
            r.param_unit = "kg/cm2g"
            r.param_low = None
            r.param_high = None
            r.sort_order = order
            r.active = True
            r.id = rid
            return r

        rows = [
            _row("PUMP_STATION_6", "052-PG-890", "Seal pressure", 1, 2),
            _row("PUMP_STATION_6", "052-PG-038", "Discharge pressure", 0, 1),
        ]
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.filter_by.return_value.all.return_value = rows

        with patch("services.stations_db.SessionLocal", return_value=mock_session):
            from services.stations_db import get_station_params
            result = get_station_params()

        params = result["PUMP_STATION_6"]["params"]
        assert len(params) == 2
        # sắp theo sort_order: 052-PG-038 (0) trước 052-PG-890 (1)
        assert params[0]["tag"] == "052-PG-038"
        assert params[1]["tag"] == "052-PG-890"

    def test_db_can_add_extra_stations(self):
        """DB có thể thêm trạm không có trong static config."""
        mock_row = MagicMock()
        mock_row.station_name = "TK-9999"
        mock_row.tag = None
        mock_row.param_label = "Áp suất"
        mock_row.param_unit = "bar"
        mock_row.param_low = None
        mock_row.param_high = None
        mock_row.sort_order = 0
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
# 3. Public GET /api/station-params — includes TK-5211A from static (grouped)
# ---------------------------------------------------------------------------
class TestPublicStationParamsEndpoint:
    def test_get_station_params_includes_tk5211a(self, flask_app):
        """/api/station-params phải trả về TK-5211A (từ static config)."""
        grouped = {
            "TK-5211A": {
                "station_name": "TK-5211A",
                "params": [{"id": None, "tag": None, "param_label": "Tank level",
                            "param_unit": "mm", "param_low": None, "param_high": None, "sort_order": 0}],
            }
        }
        with patch("routes.scan.get_station_params", return_value=grouped):
            client = flask_app.test_client()
            resp = client.get("/api/station-params")

        assert resp.status_code == 200
        configs = resp.get_json()["configs"]
        names = [c["station_name"] for c in configs]
        assert "TK-5211A" in names

    def test_get_station_params_returns_correct_labels(self, flask_app):
        """/api/station-params trả đúng param_label và param_unit trong params[0]."""
        grouped = {
            "TK-5211A": {
                "station_name": "TK-5211A",
                "params": [{"id": None, "tag": None, "param_label": "Tank level",
                            "param_unit": "mm", "param_low": None, "param_high": None, "sort_order": 0}],
            }
        }
        with patch("routes.scan.get_station_params", return_value=grouped):
            client = flask_app.test_client()
            resp = client.get("/api/station-params")

        configs = resp.get_json()["configs"]
        tk = next(c for c in configs if c["station_name"] == "TK-5211A")
        assert tk["params"][0]["param_label"] == "Tank level"
        assert tk["params"][0]["param_unit"] == "mm"


# ---------------------------------------------------------------------------
# 4. Admin POST/PUT /admin/station-params — multi-param: cho phép mọi trạm
# ---------------------------------------------------------------------------
class TestAdminStationParamMultiParam:
    def test_post_allows_param_with_tag_and_sort_order(self, flask_app):
        """POST tạo thông số kèm tag + sort_order → 201."""
        mock_sp = MagicMock()
        mock_sp.to_dict.return_value = {
            "id": 10, "station_name": "PUMP_STATION_6", "tag": "052-PG-038",
            "param_label": "Discharge pressure", "param_unit": "kg/cm2g",
            "param_low": 5, "param_high": 14, "sort_order": 0, "active": True,
        }

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.add.side_effect = lambda obj: setattr(obj, "id", 10)

        with patch("routes.admin.ADMIN_SECRET", "test-secret"):
            with patch("routes.admin.SessionLocal", return_value=mock_session):
                with patch("routes.admin.StationParam", return_value=mock_sp):
                    client = flask_app.test_client()
                    resp = client.post(
                        "/api/admin/station-params",
                        json={"station_name": "PUMP_STATION_6", "tag": "052-PG-038",
                              "param_label": "Discharge pressure", "param_unit": "kg/cm2g",
                              "param_low": 5, "param_high": 14, "sort_order": 0},
                        headers={"X-Admin-Key": "test-secret"},
                        content_type="application/json",
                    )

        assert resp.status_code == 201
        assert resp.get_json()["tag"] == "052-PG-038"

    def test_post_allowed_for_any_station(self, flask_app):
        """POST cho trạm bất kỳ (kể cả trùng tên trạm đã có thông số) → 201."""
        mock_sp = MagicMock()
        mock_sp.to_dict.return_value = {
            "id": 11, "station_name": "TK-5211A", "tag": None,
            "param_label": "Áp suất", "param_unit": "bar",
            "param_low": None, "param_high": None, "sort_order": 0, "active": True,
        }

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.add.side_effect = lambda obj: setattr(obj, "id", 11)

        with patch("routes.admin.ADMIN_SECRET", "test-secret"):
            with patch("routes.admin.SessionLocal", return_value=mock_session):
                with patch("routes.admin.StationParam", return_value=mock_sp):
                    client = flask_app.test_client()
                    resp = client.post(
                        "/api/admin/station-params",
                        json={"station_name": "TK-5211A", "param_label": "Áp suất", "param_unit": "bar"},
                        headers={"X-Admin-Key": "test-secret"},
                        content_type="application/json",
                    )

        assert resp.status_code == 201

    def test_put_updates_param(self, flask_app):
        """PUT cập nhật thông số (không còn chặn static) → 200."""
        mock_sp = MagicMock()
        mock_sp.station_name = "TK-5211A"
        mock_sp.to_dict.return_value = {
            "id": 1, "station_name": "TK-5211A", "tag": None,
            "param_label": "Mức tank", "param_unit": "mm",
            "param_low": None, "param_high": None, "sort_order": 0, "active": True,
        }

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.get.return_value = mock_sp

        with patch("routes.admin.ADMIN_SECRET", "test-secret"):
            with patch("routes.admin.SessionLocal", return_value=mock_session):
                client = flask_app.test_client()
                resp = client.put(
                    "/api/admin/station-params/1",
                    json={"param_label": "Mức tank"},
                    headers={"X-Admin-Key": "test-secret"},
                    content_type="application/json",
                )

        assert resp.status_code == 200
