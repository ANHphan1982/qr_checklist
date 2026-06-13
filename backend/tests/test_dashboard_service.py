"""
TDD — services/dashboard_service.py

Tổng hợp analytics cho trang /dashboard (quản lý). Input là list log dạng
ScanLog.to_dict() (scanned_at = ISO string, param_values = list).

Hàm:
  scan_heatmap(logs)        → list 24 phần tử, đếm scan theo giờ trong ngày (giờ VN)
  geo_status_breakdown(logs)→ {counts, total, out_of_range_rate}
  station_activity(logs)    → list/trạm {station,total,out_of_range,last_scan} sort total desc
  param_trends(logs)        → xu hướng từng (trạm, thông số): points + direction + breaches
  build_dashboard(logs)     → gộp tất cả + total
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _log(scanned_at, location="Trạm A", geo_status="ok", device_id="d1", param_values=None):
    return {
        "id": 1, "location": location, "device_id": device_id,
        "geo_status": geo_status, "scanned_at": scanned_at,
        "param_values": param_values or [],
    }


# ---------------------------------------------------------------------------
# scan_heatmap
# ---------------------------------------------------------------------------
class TestScanHeatmap:
    def test_returns_24_buckets(self):
        from services.dashboard_service import scan_heatmap
        assert len(scan_heatmap([])) == 24

    def test_empty_logs_all_zero(self):
        from services.dashboard_service import scan_heatmap
        assert scan_heatmap([]) == [0] * 24

    def test_counts_by_vn_hour(self):
        from services.dashboard_service import scan_heatmap
        # 01:30 UTC = 08:30 giờ VN (+07) → bucket 8
        hm = scan_heatmap([_log("2026-06-13T01:30:00+00:00")])
        assert hm[8] == 1
        assert sum(hm) == 1

    def test_handles_z_suffix_and_groups(self):
        from services.dashboard_service import scan_heatmap
        hm = scan_heatmap([
            _log("2026-06-13T01:00:00Z"),  # 08h VN
            _log("2026-06-13T01:59:00Z"),  # 08h VN
            _log("2026-06-13T02:00:00Z"),  # 09h VN
        ])
        assert hm[8] == 2
        assert hm[9] == 1

    def test_skips_unparseable_scanned_at(self):
        from services.dashboard_service import scan_heatmap
        hm = scan_heatmap([_log(None), _log("bad")])
        assert sum(hm) == 0


# ---------------------------------------------------------------------------
# geo_status_breakdown
# ---------------------------------------------------------------------------
class TestGeoStatusBreakdown:
    def test_empty_zero_rate(self):
        from services.dashboard_service import geo_status_breakdown
        r = geo_status_breakdown([])
        assert r["total"] == 0
        assert r["out_of_range_rate"] == 0.0

    def test_counts_each_status(self):
        from services.dashboard_service import geo_status_breakdown
        logs = [
            _log("2026-06-13T01:00:00Z", geo_status="ok"),
            _log("2026-06-13T01:00:00Z", geo_status="ok"),
            _log("2026-06-13T01:00:00Z", geo_status="out_of_range"),
            _log("2026-06-13T01:00:00Z", geo_status="cached"),
        ]
        r = geo_status_breakdown(logs)
        assert r["counts"]["ok"] == 2
        assert r["counts"]["out_of_range"] == 1
        assert r["counts"]["cached"] == 1
        assert r["total"] == 4

    def test_out_of_range_rate(self):
        from services.dashboard_service import geo_status_breakdown
        logs = [
            _log("2026-06-13T01:00:00Z", geo_status="out_of_range"),
            _log("2026-06-13T01:00:00Z", geo_status="ok"),
            _log("2026-06-13T01:00:00Z", geo_status="ok"),
            _log("2026-06-13T01:00:00Z", geo_status="ok"),
        ]
        assert geo_status_breakdown(logs)["out_of_range_rate"] == 0.25

    def test_none_geo_status_treated_as_no_gps(self):
        from services.dashboard_service import geo_status_breakdown
        log = _log("2026-06-13T01:00:00Z")
        log["geo_status"] = None
        r = geo_status_breakdown([log])
        assert r["counts"]["no_gps"] == 1


# ---------------------------------------------------------------------------
# station_activity
# ---------------------------------------------------------------------------
class TestStationActivity:
    def test_empty_returns_empty(self):
        from services.dashboard_service import station_activity
        assert station_activity([]) == []

    def test_groups_per_station_and_counts(self):
        from services.dashboard_service import station_activity
        logs = [
            _log("2026-06-13T01:00:00Z", location="A"),
            _log("2026-06-13T02:00:00Z", location="A", geo_status="out_of_range"),
            _log("2026-06-13T03:00:00Z", location="B"),
        ]
        out = station_activity(logs)
        a = next(s for s in out if s["station"] == "A")
        assert a["total"] == 2
        assert a["out_of_range"] == 1

    def test_sorted_by_total_desc(self):
        from services.dashboard_service import station_activity
        logs = (
            [_log("2026-06-13T01:00:00Z", location="Quiet")]
            + [_log("2026-06-13T01:00:00Z", location="Busy")] * 3
        )
        out = station_activity(logs)
        assert out[0]["station"] == "Busy"
        assert out[0]["total"] == 3

    def test_last_scan_is_latest_iso(self):
        from services.dashboard_service import station_activity
        logs = [
            _log("2026-06-13T01:00:00Z", location="A"),
            _log("2026-06-13T05:00:00Z", location="A"),
            _log("2026-06-13T03:00:00Z", location="A"),
        ]
        a = station_activity(logs)[0]
        assert a["last_scan"] == "2026-06-13T05:00:00Z"

    def test_skips_logs_without_location(self):
        from services.dashboard_service import station_activity
        logs = [_log("2026-06-13T01:00:00Z", location=None)]
        assert station_activity(logs) == []


# ---------------------------------------------------------------------------
# param_trends
# ---------------------------------------------------------------------------
def _pv(tag, value, low=None, high=None, label="Mức dầu", unit="mm"):
    return {"tag": tag, "label": label, "unit": unit, "value": value, "low": low, "high": high}


class TestParamTrends:
    def test_empty_returns_empty(self):
        from services.dashboard_service import param_trends
        assert param_trends([]) == []

    def test_groups_points_by_station_and_tag(self):
        from services.dashboard_service import param_trends
        logs = [
            _log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 100)]),
            _log("2026-06-13T02:00:00Z", location="A", param_values=[_pv("TK-1", 90)]),
        ]
        out = param_trends(logs)
        assert len(out) == 1
        t = out[0]
        assert t["station"] == "A"
        assert t["tag"] == "TK-1"
        assert [p["value"] for p in t["points"]] == [100, 90]

    def test_points_sorted_by_time(self):
        from services.dashboard_service import param_trends
        logs = [
            _log("2026-06-13T03:00:00Z", location="A", param_values=[_pv("TK-1", 80)]),
            _log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 100)]),
            _log("2026-06-13T02:00:00Z", location="A", param_values=[_pv("TK-1", 90)]),
        ]
        t = param_trends(logs)[0]
        assert [p["value"] for p in t["points"]] == [100, 90, 80]

    def test_direction_down_when_decreasing(self):
        from services.dashboard_service import param_trends
        logs = [
            _log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 100)]),
            _log("2026-06-13T02:00:00Z", location="A", param_values=[_pv("TK-1", 70)]),
        ]
        assert param_trends(logs)[0]["direction"] == "down"

    def test_direction_up_when_increasing(self):
        from services.dashboard_service import param_trends
        logs = [
            _log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 50)]),
            _log("2026-06-13T02:00:00Z", location="A", param_values=[_pv("TK-1", 90)]),
        ]
        assert param_trends(logs)[0]["direction"] == "up"

    def test_direction_flat_single_point(self):
        from services.dashboard_service import param_trends
        logs = [_log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 50)])]
        assert param_trends(logs)[0]["direction"] == "flat"

    def test_counts_breaches_in_trend(self):
        from services.dashboard_service import param_trends
        logs = [
            _log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", 5, low=10, high=20)]),
            _log("2026-06-13T02:00:00Z", location="A", param_values=[_pv("TK-1", 15, low=10, high=20)]),
            _log("2026-06-13T03:00:00Z", location="A", param_values=[_pv("TK-1", 25, low=10, high=20)]),
        ]
        assert param_trends(logs)[0]["breaches"] == 2

    def test_skips_non_numeric_values(self):
        from services.dashboard_service import param_trends
        logs = [_log("2026-06-13T01:00:00Z", location="A", param_values=[_pv("TK-1", None)])]
        assert param_trends(logs) == []


# ---------------------------------------------------------------------------
# build_dashboard
# ---------------------------------------------------------------------------
class TestBuildDashboard:
    def test_assembles_all_sections(self):
        from services.dashboard_service import build_dashboard
        logs = [
            _log("2026-06-13T01:00:00Z", location="A", geo_status="ok",
                 param_values=[_pv("TK-1", 100)]),
            _log("2026-06-13T02:00:00Z", location="A", geo_status="out_of_range",
                 param_values=[_pv("TK-1", 90)]),
        ]
        d = build_dashboard(logs)
        assert d["total"] == 2
        assert len(d["heatmap"]) == 24
        assert d["geo"]["counts"]["out_of_range"] == 1
        assert d["stations"][0]["station"] == "A"
        assert d["param_trends"][0]["direction"] == "down"

    def test_empty_logs_safe(self):
        from services.dashboard_service import build_dashboard
        d = build_dashboard([])
        assert d["total"] == 0
        assert d["stations"] == []
        assert d["param_trends"] == []
