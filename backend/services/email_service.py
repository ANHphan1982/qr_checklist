import resend
from datetime import datetime
from zoneinfo import ZoneInfo
from config import RESEND_API_KEY, EMAIL_FROM, EMAIL_TO

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

EMAIL_TEMPLATE = """
<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
  <h2 style="color: #16a34a; margin-bottom: 16px;">📍 Báo Cáo Checklist</h2>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr>
      <td style="padding: 8px 12px; font-weight: bold; width: 120px;">Trạm:</td>
      <td style="padding: 8px 12px;">{location}</td>
    </tr>
    <tr style="background: #f9fafb;">
      <td style="padding: 8px 12px; font-weight: bold;">Thời gian:</td>
      <td style="padding: 8px 12px;">{scanned_at}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; font-weight: bold;">Thiết bị:</td>
      <td style="padding: 8px 12px;">{device_id}</td>
    </tr>
    <tr style="background: #f9fafb;">
      <td style="padding: 8px 12px; font-weight: bold;">Vị trí GPS:</td>
      <td style="padding: 8px 12px;">{geo_info} {maps_link}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; font-weight: bold;">Mã QR:</td>
      <td style="padding: 8px 12px;">{token_info}</td>
    </tr>
    <tr style="background: #f9fafb;">
      <td style="padding: 8px 12px; font-weight: bold;">Trạng thái:</td>
      <td style="padding: 8px 12px; font-weight: bold;">{status_info}</td>
    </tr>
  </table>
  <p style="color: #6b7280; font-size: 11px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    Gửi tự động bởi hệ thống QR Checklist
  </p>
</div>
"""


THRESHOLD_ALERT_TEMPLATE = """
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <h2 style="color: #dc2626; margin-bottom: 6px;">🚨 Cảnh Báo Thông Số Vượt Ngưỡng</h2>
  <p style="font-size: 14px; color: #374151; margin: 0 0 16px;">
    Trạm <strong>{location}</strong> — {scanned_at} — thiết bị {device_id}
  </p>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr style="background: #fee2e2; color: #991b1b;">
      <th style="padding: 8px 12px; text-align: left;">Thông số</th>
      <th style="padding: 8px 12px; text-align: right;">Giá trị đo</th>
      <th style="padding: 8px 12px; text-align: left;">Ngưỡng</th>
    </tr>
    {rows}
  </table>
  <p style="color: #6b7280; font-size: 11px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    Gửi tự động bởi hệ thống QR Checklist — cần kiểm tra hiện trường ngay.
  </p>
</div>
"""


def _format_dt(dt: datetime) -> str:
    return dt.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M:%S")


def _recipients() -> list[str]:
    """Danh sách email nhận, hỗ trợ nhiều địa chỉ phân cách bằng dấu phẩy."""
    return [e.strip() for e in EMAIL_TO.split(",") if e.strip()] if EMAIL_TO else []


def _send_via_resend(params: "resend.Emails.SendParams") -> tuple[bool, str]:
    """Gửi 1 email qua Resend. Trả (ok, error_message). Dùng chung cho mọi loại email."""
    try:
        print(f"[email] Gửi đến {params.get('to')} from={params.get('from')} subject={params.get('subject')!r}")
        # Hỗ trợ cả resend >=2.7 (global API) lẫn resend 2.0.x (client API)
        if hasattr(resend, "Resend"):
            client = resend.Resend(api_key=RESEND_API_KEY)
            resp = client.emails.send(params)
        else:
            resend.api_key = RESEND_API_KEY
            resp = resend.Emails.send(params)
        print(f"[email] OK — id={getattr(resp, 'id', resp)}")
        return True, ""
    except Exception as exc:
        import traceback
        err_msg = f"{type(exc).__name__}: {exc}"
        print(f"[email] FAIL: {err_msg}")
        traceback.print_exc()
        return False, err_msg


def send_scan_email(
    location: str,
    scanned_at: datetime,
    device_id: str | None,
    lat: float | None = None,
    lng: float | None = None,
    geo_distance: float | None = None,
    geo_status: str = "no_gps",
    token_valid: bool = False,
    cache_age_ms: float | None = None,
) -> tuple[bool, str]:
    """Trả về (ok, error_message). error_message = "" nếu thành công."""
    if not RESEND_API_KEY:
        msg = "RESEND_API_KEY chưa cấu hình"
        print(f"[email] {msg}")
        return False, msg

    to_list = _recipients()
    if not to_list:
        msg = "EMAIL_TO chưa cấu hình"
        print(f"[email] {msg}")
        return False, msg

    device_label = (
        (device_id[:30] + "...") if device_id and len(device_id) > 30
        else (device_id or "Không rõ")
    )

    # GPS info
    if geo_status == "ok" and geo_distance is not None:
        geo_info = f"✅ Đúng trạm (cách {geo_distance:.0f}m)"
    elif geo_status == "out_of_range" and geo_distance is not None:
        geo_info = f"🚨 NGOÀI PHẠM VI (cách {geo_distance:.0f}m)"
    elif geo_status == "cached":
        age_part = ""
        if cache_age_ms is not None:
            age_min = int(cache_age_ms / 60000)
            age_part = f" {age_min} phút trước" if age_min >= 1 else " <1 phút trước"
        dist_part = f", cách trạm {geo_distance:.0f}m" if geo_distance is not None else ""
        geo_info = f"📍 Vị trí cache (lấy{age_part}{dist_part})"
    elif geo_status == "unverified":
        dist_part = f" (cách trạm {geo_distance:.0f}m)" if geo_distance is not None else ""
        geo_info = f"⚠️ Trạm chưa cấu hình tọa độ GPS{dist_part}"
    elif geo_status == "no_gps":
        geo_info = "⚠️ Không có GPS"
    else:
        geo_info = f"⚠️ {geo_status}"

    # Trạng thái check-in
    if geo_status == "ok":
        status_info = '<span style="color:#16a34a;">✅ Đã check-in đúng vị trí</span>'
    elif geo_status == "out_of_range":
        status_info = '<span style="color:#dc2626;">🚨 CẢNH BÁO: Không đúng vị trí trạm!</span>'
    elif geo_status == "cached":
        status_info = '<span style="color:#d97706;">📍 Đã check-in (vị trí từ cache, GPS không bắt được tại trạm)</span>'
    elif geo_status == "unverified":
        status_info = '<span style="color:#d97706;">⚠️ Đã check-in (trạm chưa cấu hình tọa độ — chưa xác nhận được vị trí)</span>'
    else:
        status_info = '<span style="color:#d97706;">⚠️ Đã check-in (không có GPS)</span>'

    maps_link = ""
    if lat is not None and lng is not None:
        maps_link = (
            f'<a href="https://maps.google.com/?q={lat},{lng}" '
            f'style="color:#2563eb;font-size:12px;">(Xem bản đồ)</a>'
        )

    # Token / anti-fraud info
    if token_valid:
        token_info = "✅ Rotating QR hợp lệ"
    else:
        token_info = "⚠️ QR tĩnh (không xác thực thời gian)"

    subject_time = scanned_at.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
    subject_prefix = "🚨 [CẢNH BÁO]" if geo_status == "out_of_range" else "[Checklist]"

    params: resend.Emails.SendParams = {
        "from": EMAIL_FROM,
        "to": to_list,
        "subject": f"{subject_prefix} {location} — {subject_time}",
        "html": EMAIL_TEMPLATE.format(
            location=location,
            scanned_at=_format_dt(scanned_at),
            device_id=device_label,
            geo_info=geo_info,
            maps_link=maps_link,
            token_info=token_info,
            status_info=status_info,
        ),
    }

    return _send_via_resend(params)


def _format_breach_row(b: dict) -> str:
    """Một dòng <tr> mô tả thông số vượt ngưỡng (giá trị đỏ + mũi tên hướng vượt)."""
    label = b.get("label") or b.get("tag") or "Thông số"
    tag = b.get("tag")
    unit = b.get("unit") or ""
    value = b.get("value")
    low = b.get("low")
    high = b.get("high")
    arrow = "🔻 thấp" if b.get("kind") == "low" else "🔺 cao"

    if low is not None and high is not None:
        threshold = f"{low}–{high} {unit}".strip()
    elif low is not None:
        threshold = f"≥ {low} {unit}".strip()
    elif high is not None:
        threshold = f"≤ {high} {unit}".strip()
    else:
        threshold = "—"

    name = f"{label}"
    if tag:
        name = f'<span style="font-family:monospace;color:#2563eb;">{tag}</span> {label}'

    return (
        '<tr>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">{name}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;'
        f'color:#dc2626;font-weight:bold;">{value} {unit} <span style="font-size:12px;">{arrow}</span></td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#6b7280;">{threshold}</td>'
        '</tr>'
    )


def send_threshold_alert_email(
    location: str,
    scanned_at: datetime,
    device_id: str | None,
    breaches: list[dict],
) -> tuple[bool, str]:
    """Gửi email khẩn liệt kê các thông số vượt ngưỡng.

    Luôn gửi (không phụ thuộc EMAIL_ALERTS_ONLY) vì bản chất là cảnh báo. Trả về
    (ok, error_message); error_message = "" nếu thành công.
    """
    if not breaches:
        return False, "Không có thông số vượt ngưỡng"
    if not RESEND_API_KEY:
        msg = "RESEND_API_KEY chưa cấu hình"
        print(f"[email] {msg}")
        return False, msg

    to_list = _recipients()
    if not to_list:
        msg = "EMAIL_TO chưa cấu hình"
        print(f"[email] {msg}")
        return False, msg

    device_label = (
        (device_id[:30] + "...") if device_id and len(device_id) > 30
        else (device_id or "Không rõ")
    )

    rows = "".join(_format_breach_row(b) for b in breaches)
    subject_time = scanned_at.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
    count = len(breaches)

    params: resend.Emails.SendParams = {
        "from": EMAIL_FROM,
        "to": to_list,
        "subject": f"🚨 [CẢNH BÁO NGƯỠNG] {location} — {count} thông số bất thường — {subject_time}",
        "html": THRESHOLD_ALERT_TEMPLATE.format(
            location=location,
            scanned_at=_format_dt(scanned_at),
            device_id=device_label,
            rows=rows,
        ),
    }

    return _send_via_resend(params)
