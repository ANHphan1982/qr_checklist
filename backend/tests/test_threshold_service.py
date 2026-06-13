"""
TDD — services/threshold_service.py

check_thresholds(param_values) → danh sách thông số vượt ngưỡng.

Mỗi param_value: {tag, label, unit, value, low, high}
Breach khi value < low (kind="low") hoặc value > high (kind="high").
Mỗi ngưỡng xét ĐỘC LẬP — config 1 ngưỡng (chỉ low hoặc chỉ high) vẫn cảnh báo.
Giá trị đúng tại ngưỡng (== low / == high) KHÔNG phải breach.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _pv(value, low=None, high=None, tag="T1", label="Áp suất", unit="bar"):
    return {"tag": tag, "label": label, "unit": unit, "value": value, "low": low, "high": high}


class TestCheckThresholdsInputGuards:
    def test_none_returns_empty(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds(None) == []

    def test_not_a_list_returns_empty(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds({"value": 5}) == []

    def test_empty_list_returns_empty(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([]) == []

    def test_non_dict_items_skipped(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds(["x", 5, None]) == []


class TestCheckThresholdsValueGuards:
    def test_value_none_skipped(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(None, low=10, high=20)]) == []

    def test_value_bool_skipped(self):
        """bool là subclass của int — không được coi là số đo."""
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(True, low=0, high=0)]) == []

    def test_value_non_numeric_string_skipped(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv("abc", low=10, high=20)]) == []

    def test_no_bounds_never_breaches(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(9999, low=None, high=None)]) == []


class TestCheckThresholdsDualBound:
    def test_within_range_no_breach(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(15, low=10, high=20)]) == []

    def test_below_low_breaches_kind_low(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(5, low=10, high=20)])
        assert len(out) == 1
        assert out[0]["kind"] == "low"

    def test_above_high_breaches_kind_high(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(25, low=10, high=20)])
        assert len(out) == 1
        assert out[0]["kind"] == "high"

    def test_exactly_at_low_is_ok(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(10, low=10, high=20)]) == []

    def test_exactly_at_high_is_ok(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(20, low=10, high=20)]) == []

    def test_decimal_just_below_low_breaches(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(9.9, low=10, high=20)])
        assert out and out[0]["kind"] == "low"


class TestCheckThresholdsSingleBound:
    def test_low_only_below_breaches(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(3, low=5, high=None)])
        assert out and out[0]["kind"] == "low"

    def test_low_only_above_no_breach(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(100, low=5, high=None)]) == []

    def test_high_only_above_breaches(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(100, low=None, high=80)])
        assert out and out[0]["kind"] == "high"

    def test_high_only_below_no_breach(self):
        from services.threshold_service import check_thresholds
        assert check_thresholds([_pv(1, low=None, high=80)]) == []


class TestCheckThresholdsShapeAndMulti:
    def test_breach_carries_full_metadata(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([_pv(5, low=10, high=20, tag="052-PI-01", label="Áp suất", unit="bar")])
        b = out[0]
        assert b["tag"] == "052-PI-01"
        assert b["label"] == "Áp suất"
        assert b["unit"] == "bar"
        assert b["value"] == 5
        assert b["low"] == 10
        assert b["high"] == 20

    def test_only_breached_params_returned(self):
        from services.threshold_service import check_thresholds
        out = check_thresholds([
            _pv(15, low=10, high=20, tag="OK"),     # trong ngưỡng
            _pv(5,  low=10, high=20, tag="LOW"),     # dưới ngưỡng
            _pv(99, low=10, high=20, tag="HIGH"),    # trên ngưỡng
            _pv(None, low=10, high=20, tag="EMPTY"), # bỏ trống
        ])
        tags = [b["tag"] for b in out]
        assert tags == ["LOW", "HIGH"]
