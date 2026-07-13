"""
TDD — Đổi tên trạm qua PUT /api/admin/stations/<old_name> với field `name`.

Yêu cầu:
- Đổi stations.name (chuẩn hoá strip + UPPER)
- Cascade cùng transaction: station_params.station_name, qr_aliases.station_name,
  scan_logs.location (lịch sử scan giữ nhất quán theo tên mới)
- Tự tạo alias qr_content=<tên cũ> → <tên mới> để QR đã in tại trạm vẫn quét được;
  nếu alias với qr_content=<tên cũ> đã tồn tại thì cập nhật thay vì tạo mới
- Tên mới rỗng → 400; trùng trạm khác → 409; trùng chính nó → 200 no-op
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, MagicMock
import config as cfg
from models import Station, StationParam, QrAlias, ScanLog


OLD = "PUMP_STATION_6"
NEW = "P-5223A"


def _station_mock(name=OLD):
    st = MagicMock()
    st.name = name
    st.to_dict.side_effect = lambda: {"name": st.name}
    return st


def _session(station, dup=None, existing_alias=None):
    """Session giả dispatch theo model — mỗi model một query-chain riêng.

    - Station: .first() lần 1 = trạm đang sửa, lần 2 = trạm trùng tên (dup check)
    - QrAlias: .first() = alias có qr_content=<tên cũ> (None nếu chưa có)
    """
    sess = MagicMock()
    sess.__enter__ = MagicMock(return_value=sess)
    sess.__exit__ = MagicMock(return_value=False)

    chains = {}

    def q(model):
        if model not in chains:
            chains[model] = MagicMock()
        return chains[model]

    sess.query.side_effect = q
    q(Station).filter.return_value.first.side_effect = [station, dup]
    q(QrAlias).filter.return_value.first.return_value = existing_alias
    return sess, chains


@pytest.fixture
def client():
    with patch.object(cfg, "SessionLocal", None):
        from app import app as flask_app
        flask_app.config["TESTING"] = True
        yield flask_app.test_client()


def _put(client, sess, body, old_name=OLD):
    with patch("routes.admin.ADMIN_SECRET", "test-secret"), \
         patch("routes.admin.SessionLocal", lambda: sess):
        return client.put(f"/api/admin/stations/{old_name}", json=body,
                          headers={"X-Admin-Key": "test-secret"})


class TestRenameStation:
    def test_rename_updates_station_name(self, client):
        station = _station_mock()
        sess, _ = _session(station)
        resp = _put(client, sess, {"name": NEW})
        assert resp.status_code == 200
        assert station.name == NEW
        assert resp.get_json()["name"] == NEW

    def test_rename_normalizes_to_upper(self, client):
        station = _station_mock()
        sess, _ = _session(station)
        resp = _put(client, sess, {"name": "  p-5223a "})
        assert resp.status_code == 200
        assert station.name == NEW

    def test_rename_empty_name_returns_400(self, client):
        station = _station_mock()
        sess, _ = _session(station)
        resp = _put(client, sess, {"name": "   "})
        assert resp.status_code == 400
        assert station.name == OLD

    def test_rename_conflict_returns_409(self, client):
        station = _station_mock()
        dup = _station_mock(name=NEW)
        sess, _ = _session(station, dup=dup)
        resp = _put(client, sess, {"name": NEW})
        assert resp.status_code == 409
        assert station.name == OLD

    def test_rename_same_name_is_noop(self, client):
        station = _station_mock()
        sess, chains = _session(station)
        resp = _put(client, sess, {"name": OLD})
        assert resp.status_code == 200
        assert station.name == OLD
        # Không cascade gì khi tên không đổi
        assert chains.get(ScanLog) is None or \
            not chains[ScanLog].filter.return_value.update.called

    def test_rename_cascades_params_aliases_scans(self, client):
        station = _station_mock()
        sess, chains = _session(station)
        resp = _put(client, sess, {"name": NEW})
        assert resp.status_code == 200
        for model in (StationParam, QrAlias, ScanLog):
            upd = chains[model].filter.return_value.update
            assert upd.call_count == 1, f"{model.__name__} chưa được cascade"
            assert NEW in upd.call_args[0][0].values()

    def test_rename_creates_alias_for_old_name(self, client):
        """QR in sẵn tại trạm chứa tên cũ → cần alias tên cũ → tên mới."""
        station = _station_mock()
        sess, _ = _session(station)
        resp = _put(client, sess, {"name": NEW})
        assert resp.status_code == 200
        added = [a[0][0] for a in sess.add.call_args_list
                 if isinstance(a[0][0], QrAlias)]
        assert len(added) == 1
        assert added[0].qr_content == OLD
        assert added[0].station_name == NEW

    def test_rename_updates_existing_alias_instead_of_duplicate(self, client):
        station = _station_mock()
        existing = MagicMock()
        existing.qr_content = OLD
        existing.station_name = OLD
        sess, _ = _session(station, existing_alias=existing)
        resp = _put(client, sess, {"name": NEW})
        assert resp.status_code == 200
        assert existing.station_name == NEW
        added = [a[0][0] for a in sess.add.call_args_list
                 if isinstance(a[0][0], QrAlias)]
        assert added == []

    def test_put_without_name_field_does_not_rename(self, client):
        """Backward compat: PUT chỉ sửa lat/lng như cũ, không đụng tên."""
        station = _station_mock()
        sess, chains = _session(station)
        resp = _put(client, sess, {"lat": 15.4, "lng": 108.8})
        assert resp.status_code == 200
        assert station.name == OLD
        assert chains.get(ScanLog) is None or \
            not chains[ScanLog].filter.return_value.update.called
