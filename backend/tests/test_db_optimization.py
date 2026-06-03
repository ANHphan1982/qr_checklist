"""
TDD — Tối ưu tài nguyên DB (Supabase free tier)

#1 Retention cấu hình được: auto-purge dùng PURGE_RETENTION_HOURS (mặc định 720h = 30 ngày)
#2 Index: scan_logs có index trên scanned_at + composite (device_id, location, scanned_at),
   và ensure_scan_log_indexes() áp index lên bảng prod đang tồn tại (CREATE INDEX IF NOT EXISTS).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch


def _make_session(scan_id=42):
    session = MagicMock()
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)
    session.flush.side_effect = lambda: setattr(session.add.call_args[0][0], "id", scan_id)
    return session


# ---------------------------------------------------------------------------
# #1 — Retention cấu hình được
# ---------------------------------------------------------------------------
class TestRetentionConfig:
    def test_config_has_default_720_hours(self):
        """PURGE_RETENTION_HOURS mặc định = 720h (30 ngày) khi không set env."""
        from config import PURGE_RETENTION_HOURS
        assert isinstance(PURGE_RETENTION_HOURS, int)
        assert PURGE_RETENTION_HOURS == 720

    def test_purge_cutoff_uses_explicit_retention(self):
        """purge_cutoff(now, retention_hours=H) = now - H giờ."""
        from services.scan_service import purge_cutoff
        now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
        assert purge_cutoff(now, retention_hours=720) == now - timedelta(hours=720)
        assert purge_cutoff(now, retention_hours=24) == now - timedelta(hours=24)

    def test_purge_cutoff_defaults_to_config(self):
        """Không truyền retention_hours → dùng PURGE_RETENTION_HOURS (720h)."""
        from services.scan_service import purge_cutoff
        from config import PURGE_RETENTION_HOURS
        now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
        assert purge_cutoff(now) == now - timedelta(hours=PURGE_RETENTION_HOURS)

    def test_purge_cutoff_default_now_is_recent(self):
        """Không truyền now → dùng thời điểm hiện tại (UTC, aware)."""
        from services.scan_service import purge_cutoff
        before = datetime.now(timezone.utc)
        cutoff = purge_cutoff(retention_hours=720)
        after = datetime.now(timezone.utc)
        assert before - timedelta(hours=720) <= cutoff <= after - timedelta(hours=720)

    def test_process_scan_still_purges_old_rows(self):
        """process_scan vẫn auto-purge (gọi DELETE) — chỉ đổi cửa sổ giữ data."""
        from services.scan_service import process_scan
        session = _make_session(scan_id=1)
        with patch("services.scan_service.SessionLocal", return_value=session):
            with patch("services.scan_service.send_scan_email", return_value=(True, "")):
                result = process_scan(location="Cổng A")
        assert result["status"] == "ok"
        # DELETE được gọi đúng 1 lần (auto-purge trước insert)
        session.query.return_value.filter.return_value.delete.assert_called_once()


# ---------------------------------------------------------------------------
# #2 — Index trên scan_logs
# ---------------------------------------------------------------------------
class TestScanLogIndexes:
    def _index_colsets(self):
        from models import ScanLog
        return [frozenset(c.name for c in idx.columns) for idx in ScanLog.__table__.indexes]

    def test_has_scanned_at_index(self):
        assert frozenset({"scanned_at"}) in self._index_colsets()

    def test_has_composite_device_location_time_index(self):
        assert frozenset({"device_id", "location", "scanned_at"}) in self._index_colsets()


class TestEnsureIndexes:
    def test_executes_create_index_if_not_exists(self):
        """ensure_scan_log_indexes phát lệnh CREATE INDEX IF NOT EXISTS cho cả 2 index."""
        from models import ensure_scan_log_indexes
        conn = MagicMock()
        engine = MagicMock()
        engine.begin.return_value.__enter__ = MagicMock(return_value=conn)
        engine.begin.return_value.__exit__ = MagicMock(return_value=False)

        ensure_scan_log_indexes(engine)

        executed = " ".join(str(c.args[0]) for c in conn.execute.call_args_list)
        assert "CREATE INDEX IF NOT EXISTS" in executed
        assert "idx_scan_logs_scanned_at" in executed
        assert "idx_scan_logs_device_loc_time" in executed

    def test_noop_when_engine_none(self):
        """engine None (DB chưa cấu hình) → không crash."""
        from models import ensure_scan_log_indexes
        ensure_scan_log_indexes(None)  # phải không raise

    def test_swallows_db_errors(self):
        """Lỗi DDL không được làm sập app khởi động."""
        from models import ensure_scan_log_indexes
        engine = MagicMock()
        engine.begin.side_effect = Exception("DB down")
        ensure_scan_log_indexes(engine)  # phải không raise
