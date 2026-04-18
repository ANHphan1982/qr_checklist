"""
Dịch vụ báo cáo tổng hợp: gửi email 2 lần/ngày (06:00 và 18:00 VN).
- morning: 00:00–06:00
- evening: 06:00–18:00
"""
from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

_GEO_LABEL = {
    "ok":           "✅ Đúng trạm",
    "out_of_range": "🚨 Ngoài phạm vi",
    "no_gps":       "⚠️ Không có GPS",
}

_PERIOD_HOURS = {
    "morning": (0, 6),
    "evening": (6, 18),
}


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def get_period_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    """Trả về (start_utc, end_utc) cho ca báo cáo."""
    vn_now = now.astimezone(VN_TZ)
    today  = vn_now.date()

    if period in _PERIOD_HOURS:
        h_start, h_end = _PERIOD_HOURS[period]
        start_vn = datetime(today.year, today.month, today.day, h_start, 0, tzinfo=VN_TZ)
        end_vn   = datetime(today.year, today.month, today.day, h_end,  0, tzinfo=VN_TZ)
    else:
        start_vn = datetime(today.year, today.month, today.day, 0, 0, tzinfo=VN_TZ)
        end_vn   = start_vn + timedelta(days=1)

    return start_vn.astimezone(timezone.utc), end_vn.astimezone(timezone.utc)


def build_period_label(period: str, now: datetime) -> str:
    vn_now = now.astimezone(VN_TZ)
    date_str = vn_now.strftime("%d/%m/%Y")

    if period == "morning":
        return f"00:00–06:00 {date_str}"
    if period == "evening":
        return f"06:00–18:00 {date_str}"
    return f"Cả ngày {date_str}"


def build_summary_subject(period: str, now: datetime) -> str:
    vn_now = now.astimezone(VN_TZ)
    time_str = vn_now.strftime("%H:%M")
    date_str = vn_now.strftime("%d/%m/%Y")
    return f"[Báo cáo] Tổng hợp {time_str} — {date_str}"


def build_static_map_url(logs, api_key: str) -> str | None:
    """Tạo Google Maps Static API URL với markers cho mỗi scan có GPS."""
    if not api_key:
        return None

    gps_logs = [l for l in logs if l.lat is not None and l.lng is not None]
    if not gps_logs:
        return None

    params = [
        ("size", "640x400"),
        ("maptype", "roadmap"),
        ("key", api_key),
    ]

    colors = ["red", "blue", "green", "orange", "purple"]
    for i, log in enumerate(gps_logs):
        color = colors[i % len(colors)]
        label = str(i + 1) if i < 9 else "+"
        marker = f"color:{color}|label:{label}|{log.lat},{log.lng}"
        params.append(("markers", marker))

    base = "https://maps.googleapis.com/maps/api/staticmap"
    query = "&".join(f"{urllib.parse.quote(k)}={urllib.parse.quote(str(v))}" for k, v in params)
    return f"{base}?{query}"


def build_summary_html(logs, period_label: str, map_url: str | None) -> str:
    total = len(logs)

    def fmt_dt(dt):
        return dt.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M:%S")

    if total == 0:
        rows_html = "<tr><td colspan='4' style='padding:12px;text-align:center;color:#6b7280;'>Không có lượt check-in nào trong ca này.</td></tr>"
    else:
        rows_html = ""
        for i, log in enumerate(logs):
            bg = "#f9fafb" if i % 2 == 0 else "#ffffff"
            geo = _GEO_LABEL.get(log.geo_status, log.geo_status or "")
            dist = f" ({log.geo_distance:.0f}m)" if log.geo_distance is not None else ""
            rows_html += f"""
            <tr style="background:{bg};">
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">{i+1}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">{log.location}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">{fmt_dt(log.scanned_at)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">{geo}{dist}</td>
            </tr>"""

    map_section = ""
    if map_url:
        map_section = f"""
        <div style="margin-top:20px;">
          <h3 style="color:#374151;font-size:14px;margin-bottom:8px;">🗺️ Bản đồ vị trí check-in</h3>
          <img src="{map_url}" alt="Bản đồ vị trí" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" />
          <p style="font-size:11px;color:#9ca3af;margin-top:4px;">Chỉ hiển thị scan có dữ liệu GPS</p>
        </div>"""

    return f"""
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
  <div style="background:#1d4ed8;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">📊 Báo Cáo Tổng Hợp Checklist</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.85;">Ca: {period_label}</p>
  </div>

  <div style="background:#eff6ff;padding:12px 20px;border-left:4px solid #1d4ed8;">
    <span style="font-size:28px;font-weight:bold;color:#1d4ed8;">{total}</span>
    <span style="font-size:14px;color:#374151;margin-left:6px;">lượt check-in</span>
  </div>

  <div style="padding:16px 0;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 10px;text-align:left;width:32px;">#</th>
          <th style="padding:8px 10px;text-align:left;">Trạm</th>
          <th style="padding:8px 10px;text-align:left;">Thời gian</th>
          <th style="padding:8px 10px;text-align:left;">GPS</th>
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>

  {map_section}

  <p style="color:#9ca3af;font-size:11px;margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;">
    Gửi tự động bởi hệ thống QR Checklist · {period_label}
  </p>
</div>
"""


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def send_summary_report(period: str, now: datetime | None = None) -> tuple[bool, str]:
    """Truy vấn DB, tạo email, gửi qua Resend. Trả về (ok, message)."""
    from config import SessionLocal, RESEND_API_KEY, EMAIL_FROM, EMAIL_TO
    from models import ScanLog
    from sqlalchemy import and_
    import os

    if now is None:
        now = datetime.now(VN_TZ)

    if SessionLocal is None:
        return False, "Database không khả dụng"

    start_utc, end_utc = get_period_bounds(period, now)

    with SessionLocal() as session:
        logs = (
            session.query(ScanLog)
            .filter(and_(ScanLog.scanned_at >= start_utc, ScanLog.scanned_at < end_utc))
            .order_by(ScanLog.scanned_at.asc())
            .all()
        )
        logs = list(logs)  # eagerly load before session closes

    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    map_url = build_static_map_url(logs, api_key)
    label   = build_period_label(period, now)
    html    = build_summary_html(logs, label, map_url)
    subject = build_summary_subject(period, now)

    to_list = [e.strip() for e in EMAIL_TO.split(",") if e.strip()] if EMAIL_TO else []
    if not to_list:
        return False, "EMAIL_TO chưa cấu hình"
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY chưa cấu hình"

    try:
        import resend
        params = {"from": EMAIL_FROM, "to": to_list, "subject": subject, "html": html}
        if hasattr(resend, "Resend"):
            client = resend.Resend(api_key=RESEND_API_KEY)
            resp = client.emails.send(params)
        else:
            resend.api_key = RESEND_API_KEY
            resp = resend.Emails.send(params)
        print(f"[summary] OK id={getattr(resp, 'id', resp)} period={period} total={len(logs)}")
        return True, f"Đã gửi báo cáo {label} ({len(logs)} scans)"
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        print(f"[summary] FAIL: {msg}")
        return False, msg
