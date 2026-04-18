"""
TDD — summary_service.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch, MagicMock

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _vn(hour, minute=0, day=18, month=4, year=2026):
    return datetime(year, month, day, hour, minute, tzinfo=VN_TZ)


def _make_log(location="TK-5201A", lat=15.4088, lng=108.8146,
              scanned_at=None, geo_status="ok", geo_distance=30.0):
    log = MagicMock()
    log.location = location
    log.lat = lat
    log.lng = lng
    log.scanned_at = scanned_at or _vn(8, 30).astimezone(timezone.utc)
    log.geo_status = geo_status
    log.geo_distance = geo_distance
    log.device_id = "ua-hash-abc"
    log.email_sent = True
    log.token_valid = False
    return log


# ---------------------------------------------------------------------------
# get_period_bounds
# ---------------------------------------------------------------------------
class TestGetPeriodBounds:
    def test_morning_period_returns_midnight_to_0600(self):
        from services.summary_service import get_period_bounds
        now = _vn(6, 0)
        start, end = get_period_bounds("morning", now)
        assert start == _vn(0, 0).astimezone(timezone.utc)
        assert end   == _vn(6, 0).astimezone(timezone.utc)

    def test_evening_period_returns_0600_to_1800(self):
        from services.summary_service import get_period_bounds
        now = _vn(18, 0)
        start, end = get_period_bounds("evening", now)
        assert start == _vn(6, 0).astimezone(timezone.utc)
        assert end   == _vn(18, 0).astimezone(timezone.utc)

    def test_unknown_period_defaults_to_full_day(self):
        from services.summary_service import get_period_bounds
        now = _vn(12, 0)
        start, end = get_period_bounds("other", now)
        assert start == _vn(0, 0).astimezone(timezone.utc)
        # end = đầu ngày hôm sau (exclusive upper bound)
        assert end == _vn(0, 0, day=19).astimezone(timezone.utc)

    def test_bounds_are_utc(self):
        from services.summary_service import get_period_bounds
        now = _vn(6, 0)
        start, end = get_period_bounds("morning", now)
        assert start.tzinfo == timezone.utc
        assert end.tzinfo   == timezone.utc


# ---------------------------------------------------------------------------
# build_period_label
# ---------------------------------------------------------------------------
class TestBuildPeriodLabel:
    def test_morning_label(self):
        from services.summary_service import build_period_label
        label = build_period_label("morning", _vn(6, 0))
        assert "00:00" in label
        assert "06:00" in label
        assert "18/04/2026" in label

    def test_evening_label(self):
        from services.summary_service import build_period_label
        label = build_period_label("evening", _vn(18, 0))
        assert "06:00" in label
        assert "18:00" in label


# ---------------------------------------------------------------------------
# build_static_map_url
# ---------------------------------------------------------------------------
class TestBuildStaticMapUrl:
    def test_returns_none_when_no_api_key(self):
        from services.summary_service import build_static_map_url
        logs = [_make_log()]
        assert build_static_map_url(logs, api_key="") is None

    def test_returns_none_when_no_logs_with_gps(self):
        from services.summary_service import build_static_map_url
        log = _make_log(lat=None, lng=None)
        assert build_static_map_url([log], api_key="KEY") is None

    def test_returns_url_string_with_key(self):
        from services.summary_service import build_static_map_url
        url = build_static_map_url([_make_log()], api_key="TESTKEY")
        assert url is not None
        assert "maps.googleapis.com" in url
        assert "TESTKEY" in url

    def test_url_contains_marker_coordinates(self):
        from services.summary_service import build_static_map_url
        log = _make_log(lat=15.4088, lng=108.8146)
        url = build_static_map_url([log], api_key="TESTKEY")
        assert "15.4088" in url
        assert "108.8146" in url

    def test_multiple_logs_produce_multiple_markers(self):
        from services.summary_service import build_static_map_url
        logs = [
            _make_log(lat=15.4088, lng=108.8146),
            _make_log(lat=15.4090, lng=108.8150, location="TK-5202B"),
        ]
        url = build_static_map_url(logs, api_key="TESTKEY")
        assert url.count("markers=") >= 2

    def test_skips_logs_without_gps(self):
        from services.summary_service import build_static_map_url
        logs = [
            _make_log(lat=None, lng=None),
            _make_log(lat=15.4088, lng=108.8146),
        ]
        url = build_static_map_url(logs, api_key="TESTKEY")
        assert url is not None  # vẫn tạo được map với log có GPS


# ---------------------------------------------------------------------------
# build_summary_html
# ---------------------------------------------------------------------------
class TestBuildSummaryHtml:
    def test_returns_html_string(self):
        from services.summary_service import build_summary_html
        logs = [_make_log()]
        html = build_summary_html(logs, period_label="06:00–18:00 18/04/2026", map_url=None)
        assert isinstance(html, str)
        assert "<html" in html or "<div" in html

    def test_html_contains_period_label(self):
        from services.summary_service import build_summary_html
        logs = [_make_log()]
        html = build_summary_html(logs, period_label="06:00–18:00 18/04/2026", map_url=None)
        assert "06:00–18:00" in html

    def test_html_contains_total_scan_count(self):
        from services.summary_service import build_summary_html
        logs = [_make_log(), _make_log(location="TK-5202B")]
        html = build_summary_html(logs, period_label="test", map_url=None)
        assert "2" in html

    def test_html_contains_each_location(self):
        from services.summary_service import build_summary_html
        logs = [_make_log(location="TK-5201A"), _make_log(location="TK-5999Z")]
        html = build_summary_html(logs, period_label="test", map_url=None)
        assert "TK-5201A" in html
        assert "TK-5999Z" in html

    def test_html_contains_map_image_when_url_provided(self):
        from services.summary_service import build_summary_html
        logs = [_make_log()]
        html = build_summary_html(logs, period_label="test", map_url="https://maps.googleapis.com/test")
        assert "<img" in html
        assert "maps.googleapis.com" in html

    def test_html_no_map_section_when_url_none(self):
        from services.summary_service import build_summary_html
        logs = [_make_log()]
        html = build_summary_html(logs, period_label="test", map_url=None)
        assert "maps.googleapis.com" not in html

    def test_html_contains_scan_times_in_vn_timezone(self):
        from services.summary_service import build_summary_html
        # scanned_at = 01:30 UTC = 08:30 VN
        log = _make_log(scanned_at=datetime(2026, 4, 18, 1, 30, tzinfo=timezone.utc))
        html = build_summary_html([log], period_label="test", map_url=None)
        assert "08:30" in html

    def test_empty_logs_shows_no_scan_message(self):
        from services.summary_service import build_summary_html
        html = build_summary_html([], period_label="test", map_url=None)
        assert "không có" in html.lower() or "0" in html


# ---------------------------------------------------------------------------
# build_summary_subject
# ---------------------------------------------------------------------------
class TestBuildSummarySubject:
    def test_morning_subject(self):
        from services.summary_service import build_summary_subject
        subj = build_summary_subject("morning", _vn(6, 0))
        assert "[Báo cáo]" in subj
        assert "06:00" in subj
        assert "18/04/2026" in subj

    def test_evening_subject(self):
        from services.summary_service import build_summary_subject
        subj = build_summary_subject("evening", _vn(18, 0))
        assert "18:00" in subj
