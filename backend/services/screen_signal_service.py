"""
Phân loại + format tín hiệu phát hiện QR scan từ màn hình.

Mode: WARNING-ONLY. Backend KHÔNG block scan dựa trên screen_score; chỉ:
  1. Lưu score + signals breakdown vào scan_logs (cột screen_score, screen_signals, screen_class)
  2. Thêm prefix [NGHI VAN] / [NGUY CO CAO] vào subject email
  3. Chèn block HTML cảnh báo vào body email với breakdown chi tiết

Threshold đồng nhất với frontend (lib/screenDetection.js):
  score < 0.5    → 'clean'
  0.5 ≤ score    → 'suspicious'
  score ≥ 0.8    → 'high_risk'
"""
from __future__ import annotations
import math
from typing import Any

SUSPICIOUS_THRESHOLD = 0.5
HIGH_RISK_THRESHOLD = 0.8

_VALID_CLASSES = {"clean", "suspicious", "high_risk"}
_KNOWN_SIGNAL_KEYS = ("flicker", "uniformity", "moire")


def _coerce_score(score: Any) -> float | None:
    """Convert input → float trong [0, 1], hoặc None nếu không hợp lệ."""
    if score is None:
        return None
    try:
        v = float(score)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    if v < 0:
        return 0.0
    if v > 1:
        return 1.0
    return v


def classify_screen_score(score: Any) -> str:
    """
    Phân loại score → 'clean' | 'suspicious' | 'high_risk'.

    Defensive: input không hợp lệ (None, NaN, string) trả 'clean' để tránh
    block nhân viên hợp pháp do bug client.
    """
    v = _coerce_score(score)
    if v is None:
        return "clean"
    if v >= HIGH_RISK_THRESHOLD:
        return "high_risk"
    if v >= SUSPICIOUS_THRESHOLD:
        return "suspicious"
    return "clean"


def get_screen_subject_prefix(screen_class: str | None) -> str:
    """
    Trả prefix subject email theo class. Text thuần, không emoji (theo yêu cầu).
    """
    if screen_class == "high_risk":
        return "[NGUY CO CAO] "
    if screen_class == "suspicious":
        return "[NGHI VAN] "
    return ""


def sanitize_screen_signals(signals: Any) -> dict | None:
    """
    Validate + clamp dict signals từ client.
    Trả None nếu input không phải dict (client chưa gửi feature này).
    Trả dict có đúng 3 key flicker/uniformity/moire, mỗi value clamp [0,1].
    """
    if signals is None or not isinstance(signals, dict):
        return None

    out = {}
    for key in _KNOWN_SIGNAL_KEYS:
        v = signals.get(key)
        try:
            f = float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            f = 0.0
        if math.isnan(f) or math.isinf(f):
            f = 0.0
        out[key] = max(0.0, min(1.0, f))
    return out


def _bar(pct: float, color: str) -> str:
    """Render thanh tỉ lệ HTML đơn giản (inline-style, email-safe)."""
    width_pct = int(round(pct * 100))
    return (
        '<div style="background:#f3f4f6;width:120px;height:8px;'
        'border-radius:4px;display:inline-block;vertical-align:middle;">'
        f'<div style="background:{color};width:{width_pct}%;height:8px;'
        'border-radius:4px;"></div></div>'
    )


def format_screen_warning_html(
    screen_class: str,
    score: float,
    signals: dict | None,
) -> str:
    """
    Render block HTML cảnh báo để chèn vào email.
    Trả "" cho class 'clean' (không cảnh báo).

    Email-safe HTML: inline styles only, không dùng class CSS, không script.
    """
    if screen_class not in ("suspicious", "high_risk"):
        return ""

    score_clamped = _coerce_score(score) or 0.0
    score_pct = int(round(score_clamped * 100))

    signals = signals or {}
    flicker = float(signals.get("flicker") or 0)
    uniformity = float(signals.get("uniformity") or 0)
    moire = float(signals.get("moire") or 0)

    if screen_class == "high_risk":
        label = "NGUY CO CAO"
        bg_color = "#fef2f2"
        border_color = "#dc2626"
        text_color = "#991b1b"
        bar_color = "#dc2626"
        title = "Nguy co cao: QR co the duoc scan tu man hinh may tinh"
    else:
        label = "NGHI VAN"
        bg_color = "#fffbeb"
        border_color = "#d97706"
        text_color = "#92400e"
        bar_color = "#d97706"
        title = "Nghi van: QR co the duoc scan tu man hinh may tinh"

    return (
        f'<div style="background:{bg_color};border:1px solid {border_color};'
        f'border-radius:8px;padding:12px 16px;margin:12px 0;color:{text_color};'
        'font-family:Arial,sans-serif;font-size:13px;">'
        f'<div style="font-weight:bold;font-size:14px;margin-bottom:6px;">'
        f'[{label}] {title}</div>'
        f'<div style="margin-bottom:8px;">Diem nghi van: <b>{score_pct}%</b> '
        f'(nguong: suspicious {int(SUSPICIOUS_THRESHOLD*100)}%, '
        f'high risk {int(HIGH_RISK_THRESHOLD*100)}%)</div>'
        '<table style="font-size:12px;border-collapse:collapse;">'
        f'<tr><td style="padding:2px 8px 2px 0;">Flicker (refresh):</td>'
        f'<td style="padding:2px 0;">{_bar(flicker, bar_color)} '
        f'<span style="margin-left:6px;">{int(round(flicker*100))}%</span></td></tr>'
        f'<tr><td style="padding:2px 8px 2px 0;">Uniformity (do dong deu):</td>'
        f'<td style="padding:2px 0;">{_bar(uniformity, bar_color)} '
        f'<span style="margin-left:6px;">{int(round(uniformity*100))}%</span></td></tr>'
        f'<tr><td style="padding:2px 8px 2px 0;">Moire (van giao thoa):</td>'
        f'<td style="padding:2px 0;">{_bar(moire, bar_color)} '
        f'<span style="margin-left:6px;">{int(round(moire*100))}%</span></td></tr>'
        '</table>'
        '<div style="margin-top:8px;font-size:11px;opacity:0.8;">'
        'Luu y: day la canh bao tu dong, co the false positive voi giay '
        'laminated duoi den LED. Vui long xac minh truc tiep.'
        '</div>'
        '</div>'
    )
