"""
TDD — Hướng A: gán trạm vào checklist lưu ở BACKEND (cột stations.checklist_type)
để mọi điện thoại đọc chung qua API public.

- Station.to_dict trả checklist_type
- ensure_station_columns: idempotent, no-op khi engine None
- get_checklist_assignments: gom trạm active theo checklist_type
- GET /api/checklist-stations: public (không auth), trả {assignments: {...}}
- PUT /api/admin/stations/<name>: set / clear checklist_type (cần admin key)
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import config as cfg


def _fake_sessionlocal(stations):
    """SessionLocal giả: query(...).filter(...).all() → stations."""
    sess = MagicMock()
    sess.__enter__ = MagicMock(return_value=sess)
    sess.__exit__ = MagicMock(return_value=False)
    sess.query.return_value.filter.return_value.all.return_value = stations
    return lambda: sess


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
class TestStationModel:
    def test_to_dict_includes_checklist_type(self):
        from models import Station
        st = Station(name="LA-8111", lat=1.0, lng=2.0, radius=300, checklist_type="routine")
        assert st.to_dict()["checklist_type"] == "routine"

    def test_to_dict_checklist_type_none_default(self):
        from models import Station
        st = Station(name="A", lat=1.0, lng=2.0)
        assert st.to_dict()["checklist_type"] is None

    def test_to_dict_includes_checklist_types_list(self):
        """Trạm thuộc NHIỀU checklist → checklist_types là danh sách."""
        from models import Station
        st = Station(name="A", lat=1.0, lng=2.0, checklist_types=["pump", "routine"])
        assert st.to_dict()["checklist_types"] == ["pump", "routine"]
        # checklist_type (single) giữ backward compat = phần tử đầu
        assert st.to_dict()["checklist_type"] == "pump"

    def test_to_dict_checklist_types_falls_back_to_single(self):
        """Trạm cũ chỉ có checklist_type → checklist_types = [checklist_type]."""
        from models import Station
        st = Station(name="A", lat=1.0, lng=2.0, checklist_type="routine")
        assert st.to_dict()["checklist_types"] == ["routine"]

    def test_to_dict_checklist_types_empty_when_unassigned(self):
        from models import Station
        st = Station(name="A", lat=1.0, lng=2.0)
        assert st.to_dict()["checklist_types"] == []

    def test_ensure_station_columns_none_engine_noop(self):
        from models import ensure_station_columns
        assert ensure_station_columns(None) is None


class TestResolveChecklistList:
    """resolve_checklist_list — chuẩn hoá danh sách checklist của 1 trạm
    (lowercase, strip, bỏ rỗng, dedupe giữ thứ tự), fallback single-value."""

    def test_list_normalized_and_deduped(self):
        from models import resolve_checklist_list
        assert resolve_checklist_list(["Pump", " routine ", "pump", ""], None) == ["pump", "routine"]

    def test_falls_back_to_single_value(self):
        from models import resolve_checklist_list
        assert resolve_checklist_list(None, "Routine") == ["routine"]

    def test_empty_list_wins_over_single(self):
        """checklist_types là list rỗng (đã gỡ hết) → [] kể cả khi single còn giá trị cũ."""
        from models import resolve_checklist_list
        assert resolve_checklist_list([], "routine") == []

    def test_none_and_none_returns_empty(self):
        from models import resolve_checklist_list
        assert resolve_checklist_list(None, None) == []


# ---------------------------------------------------------------------------
# get_checklist_assignments
# ---------------------------------------------------------------------------
class TestGetChecklistAssignments:
    def test_groups_active_stations_by_type(self):
        import services.stations_db as sdb
        stations = [
            SimpleNamespace(name="LA-8111", checklist_type="routine", active=True),
            SimpleNamespace(name="PUMP_STATION_6", checklist_type="pump", active=True),
            SimpleNamespace(name="LA-9000", checklist_type="routine", active=True),
            SimpleNamespace(name="NOTYPE", checklist_type=None, active=True),
        ]
        with patch.object(sdb, "SessionLocal", _fake_sessionlocal(stations)):
            out = sdb.get_checklist_assignments()
        assert out == {"routine": ["LA-8111", "LA-9000"], "pump": ["PUMP_STATION_6"]}

    def test_station_in_multiple_checklists(self):
        """Trạm có checklist_types nhiều giá trị → xuất hiện trong mọi checklist đó."""
        import services.stations_db as sdb
        stations = [
            SimpleNamespace(name="LA-8111", checklist_types=["routine", "safety"],
                            checklist_type="routine", active=True),
            SimpleNamespace(name="PUMP_STATION_6", checklist_types=["pump"],
                            checklist_type="pump", active=True),
        ]
        with patch.object(sdb, "SessionLocal", _fake_sessionlocal(stations)):
            out = sdb.get_checklist_assignments()
        assert out == {
            "routine": ["LA-8111"],
            "safety": ["LA-8111"],
            "pump": ["PUMP_STATION_6"],
        }

    def test_no_db_returns_empty(self):
        import services.stations_db as sdb
        with patch.object(sdb, "SessionLocal", None):
            assert sdb.get_checklist_assignments() == {}


# ---------------------------------------------------------------------------
# Public route
# ---------------------------------------------------------------------------
@pytest.fixture
def client():
    with patch.object(cfg, "SessionLocal", None):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        yield flask_app.test_client()


class TestChecklistStationsRoute:
    def test_public_no_auth_returns_assignments(self, client):
        with patch("routes.scan.get_checklist_assignments", return_value={"routine": ["LA-8111"]}):
            resp = client.get("/api/checklist-stations")
        assert resp.status_code == 200
        assert resp.get_json()["assignments"] == {"routine": ["LA-8111"]}


# ---------------------------------------------------------------------------
# Admin PUT checklist_type
# ---------------------------------------------------------------------------
class TestAdminSetChecklistType:
    def _station_mock(self):
        st = MagicMock()
        st.checklist_type = None
        st.to_dict.return_value = {"name": "LA-8111", "checklist_type": st.checklist_type}
        return st

    def _client_with_session(self, station):
        sess = MagicMock()
        sess.__enter__ = MagicMock(return_value=sess)
        sess.__exit__ = MagicMock(return_value=False)
        sess.query.return_value.filter.return_value.first.return_value = station
        return sess

    def test_put_sets_checklist_type(self):
        station = self._station_mock()
        sess = self._client_with_session(station)
        with patch.object(cfg, "SessionLocal", None):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            c = flask_app.test_client()
        with patch("routes.admin.ADMIN_SECRET", "test-secret"), \
             patch("routes.admin.SessionLocal", lambda: sess):
            resp = c.put("/api/admin/stations/LA-8111",
                         json={"checklist_type": "routine"},
                         headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200
        assert station.checklist_type == "routine"

    def test_put_clears_checklist_type_with_empty_string(self):
        station = self._station_mock()
        station.checklist_type = "routine"
        sess = self._client_with_session(station)
        with patch.object(cfg, "SessionLocal", None):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            c = flask_app.test_client()
        with patch("routes.admin.ADMIN_SECRET", "test-secret"), \
             patch("routes.admin.SessionLocal", lambda: sess):
            resp = c.put("/api/admin/stations/LA-8111",
                         json={"checklist_type": ""},
                         headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200
        assert station.checklist_type is None

    def test_put_requires_auth(self):
        with patch.object(cfg, "SessionLocal", None):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            c = flask_app.test_client()
        with patch("routes.admin.ADMIN_SECRET", "test-secret"):
            resp = c.put("/api/admin/stations/LA-8111", json={"checklist_type": "routine"})
        assert resp.status_code == 401

    def test_put_sets_multiple_checklist_types(self):
        """PUT checklist_types (list) → trạm thuộc nhiều checklist; single sync = đầu list."""
        station = self._station_mock()
        sess = self._client_with_session(station)
        with patch.object(cfg, "SessionLocal", None):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            c = flask_app.test_client()
        with patch("routes.admin.ADMIN_SECRET", "test-secret"), \
             patch("routes.admin.SessionLocal", lambda: sess):
            resp = c.put("/api/admin/stations/LA-8111",
                         json={"checklist_types": ["Pump", "routine", "pump"]},
                         headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200
        assert station.checklist_types == ["pump", "routine"]   # normalized + deduped
        assert station.checklist_type == "pump"                  # backward-compat sync

    def test_put_empty_list_clears_assignment(self):
        station = self._station_mock()
        station.checklist_type = "routine"
        station.checklist_types = ["routine"]
        sess = self._client_with_session(station)
        with patch.object(cfg, "SessionLocal", None):
            from app import app as flask_app
            flask_app.config["TESTING"] = True
            c = flask_app.test_client()
        with patch("routes.admin.ADMIN_SECRET", "test-secret"), \
             patch("routes.admin.SessionLocal", lambda: sess):
            resp = c.put("/api/admin/stations/LA-8111",
                         json={"checklist_types": []},
                         headers={"X-Admin-Key": "test-secret"})
        assert resp.status_code == 200
        assert station.checklist_types == []
        assert station.checklist_type is None
