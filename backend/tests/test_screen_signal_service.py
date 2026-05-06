"""
TDD — services.screen_signal_service

Service backend để:
  1. Phân loại screen_score (0-1) thành class: clean / suspicious / high_risk
  2. Tạo email subject prefix theo class
  3. Render HTML warning block để chèn vào email khi nghi vấn

Threshold (warning-only mode):
  score < 0.5    → 'clean'      (no warning)
  0.5 ≤ score    → 'suspicious' ([NGHI VAN])
  score ≥ 0.8    → 'high_risk'  ([NGUY CO CAO])
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.screen_signal_service import (
    classify_screen_score,
    get_screen_subject_prefix,
    format_screen_warning_html,
    sanitize_screen_signals,
    SUSPICIOUS_THRESHOLD,
    HIGH_RISK_THRESHOLD,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestThresholds:
    def test_thresholds_match_frontend_constants(self):
        assert SUSPICIOUS_THRESHOLD == 0.5
        assert HIGH_RISK_THRESHOLD == 0.8


# ---------------------------------------------------------------------------
# classify_screen_score
# ---------------------------------------------------------------------------

class TestClassify:
    def test_clean_when_score_below_suspicious(self):
        assert classify_screen_score(0.0) == "clean"
        assert classify_screen_score(0.3) == "clean"
        assert classify_screen_score(0.499) == "clean"

    def test_suspicious_at_and_above_threshold(self):
        assert classify_screen_score(0.5) == "suspicious"
        assert classify_screen_score(0.7) == "suspicious"
        assert classify_screen_score(0.799) == "suspicious"

    def test_high_risk_at_and_above_threshold(self):
        assert classify_screen_score(0.8) == "high_risk"
        assert classify_screen_score(0.95) == "high_risk"
        assert classify_screen_score(1.0) == "high_risk"

    def test_clean_when_score_is_none(self):
        # score=None nghĩa là client không gửi (chưa enable feature) → không cảnh báo
        assert classify_screen_score(None) == "clean"

    def test_clean_when_score_is_invalid(self):
        # Defensive — đầu vào lỗi không gây crash
        assert classify_screen_score("invalid") == "clean"
        assert classify_screen_score(float("nan")) == "clean"

    def test_clamp_score_above_one(self):
        # Client malicious gửi 999 → vẫn classify đúng (high_risk), không crash
        assert classify_screen_score(999) == "high_risk"

    def test_clamp_score_below_zero(self):
        assert classify_screen_score(-1) == "clean"


# ---------------------------------------------------------------------------
# get_screen_subject_prefix
# ---------------------------------------------------------------------------

class TestSubjectPrefix:
    def test_no_prefix_for_clean(self):
        # 'clean' không cần prefix nghi vấn — giữ nguyên subject gốc
        assert get_screen_subject_prefix("clean") == ""

    def test_text_only_no_emoji_for_suspicious(self):
        prefix = get_screen_subject_prefix("suspicious")
        assert "[NGHI VAN]" in prefix
        # User chọn text thuần, không emoji
        assert "⚠️" not in prefix
        assert "🚨" not in prefix

    def test_text_only_no_emoji_for_high_risk(self):
        prefix = get_screen_subject_prefix("high_risk")
        assert "[NGUY CO CAO]" in prefix
        assert "⚠️" not in prefix
        assert "🚨" not in prefix

    def test_unknown_class_returns_empty(self):
        assert get_screen_subject_prefix("unknown") == ""
        assert get_screen_subject_prefix(None) == ""


# ---------------------------------------------------------------------------
# format_screen_warning_html
# ---------------------------------------------------------------------------

class TestFormatHtml:
    def test_clean_returns_empty_string(self):
        # Không chèn block khi clean — email giữ nguyên format
        html = format_screen_warning_html(
            screen_class="clean",
            score=0.2,
            signals={"flicker": 0.1, "uniformity": 0.2, "moire": 0.1},
        )
        assert html == ""

    def test_suspicious_renders_html_block(self):
        html = format_screen_warning_html(
            screen_class="suspicious",
            score=0.65,
            signals={"flicker": 0.7, "uniformity": 0.5, "moire": 0.3},
        )
        assert html != ""
        # Chứa label phân loại
        assert "NGHI VAN" in html
        # Chứa score 65% (hoặc 0.65)
        assert "65" in html or "0.65" in html or "0.6" in html
        # Chứa breakdown
        assert "flicker" in html.lower()
        assert "uniformity" in html.lower()
        assert "moire" in html.lower() or "moiré" in html.lower()

    def test_high_risk_renders_html_block_with_red_color(self):
        html = format_screen_warning_html(
            screen_class="high_risk",
            score=0.92,
            signals={"flicker": 0.95, "uniformity": 0.85, "moire": 0.80},
        )
        assert html != ""
        assert "NGUY CO CAO" in html
        # High risk dùng màu cảnh báo mạnh (đỏ)
        assert "#dc2626" in html or "#ef4444" in html or "red" in html.lower()

    def test_no_emoji_in_warning_html(self):
        # User chọn text thuần
        for cls, score in [("suspicious", 0.6), ("high_risk", 0.9)]:
            html = format_screen_warning_html(
                screen_class=cls,
                score=score,
                signals={"flicker": 0.5, "uniformity": 0.5, "moire": 0.5},
            )
            assert "⚠️" not in html
            assert "🚨" not in html

    def test_handles_missing_signals(self):
        # Defensive: signals=None hoặc thiếu key
        html = format_screen_warning_html(
            screen_class="suspicious",
            score=0.6,
            signals=None,
        )
        # Không crash, vẫn trả HTML có nội dung
        assert html != ""

        html2 = format_screen_warning_html(
            screen_class="suspicious",
            score=0.6,
            signals={"flicker": 0.7},  # thiếu uniformity, moire
        )
        assert html2 != ""

    def test_score_displayed_as_percentage(self):
        html = format_screen_warning_html(
            screen_class="high_risk",
            score=0.85,
            signals={"flicker": 0.9, "uniformity": 0.8, "moire": 0.8},
        )
        # 85% là dạng dễ đọc nhất cho admin
        assert "85" in html


# ---------------------------------------------------------------------------
# sanitize_screen_signals — defensive validation cho input từ client
# ---------------------------------------------------------------------------

class TestSanitize:
    def test_passthrough_valid_signals(self):
        sig = {"flicker": 0.5, "uniformity": 0.3, "moire": 0.2}
        clean = sanitize_screen_signals(sig)
        assert clean == {"flicker": 0.5, "uniformity": 0.3, "moire": 0.2}

    def test_clamp_out_of_range(self):
        sig = {"flicker": 2.5, "uniformity": -1.0, "moire": 999}
        clean = sanitize_screen_signals(sig)
        assert clean["flicker"] == 1.0
        assert clean["uniformity"] == 0.0
        assert clean["moire"] == 1.0

    def test_drop_unknown_keys(self):
        # Client gửi key lạ → không lưu vào DB (tránh JSON injection / bloat)
        sig = {"flicker": 0.5, "evil_key": "DROP TABLE users"}
        clean = sanitize_screen_signals(sig)
        assert "evil_key" not in clean
        assert clean["flicker"] == 0.5

    def test_default_zero_for_missing(self):
        sig = {"flicker": 0.5}
        clean = sanitize_screen_signals(sig)
        assert clean["uniformity"] == 0.0
        assert clean["moire"] == 0.0

    def test_default_zero_for_invalid_types(self):
        sig = {"flicker": "abc", "uniformity": None, "moire": [1, 2]}
        clean = sanitize_screen_signals(sig)
        assert clean["flicker"] == 0.0
        assert clean["uniformity"] == 0.0
        assert clean["moire"] == 0.0

    def test_returns_none_when_input_is_none(self):
        # Input None nghĩa là client không gửi feature này → giữ NULL trong DB
        assert sanitize_screen_signals(None) is None

    def test_returns_none_for_non_dict_input(self):
        assert sanitize_screen_signals("not a dict") is None
        assert sanitize_screen_signals(42) is None
        assert sanitize_screen_signals([1, 2, 3]) is None
