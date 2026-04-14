import resend
from datetime import datetime
from zoneinfo import ZoneInfo
from config import RESEND_API_KEY, EMAIL_FROM, EMAIL_TO

resend.api_key = RESEND_API_KEY

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

EMAIL_TEMPLATE = """
<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
  <h2 style="color: #16a34a;">📍 Báo Cáo Checklist</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px; font-weight: bold;">Trạm:</td>
      <td style="padding: 8px;">{location}</td>
    </tr>
    <tr style="background: #f9fafb;">
      <td style="padding: 8px; font-weight: bold;">Thời gian:</td>
      <td style="padding: 8px;">{scanned_at}</td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold;">Thiết bị:</td>
      <td style="padding: 8px;">{device_id}</td>
    </tr>
    <tr style="background: #f9fafb;">
      <td style="padding: 8px; font-weight: bold;">Vị trí GPS:</td>
      <td style="padding: 8px;">
        {geo_info}
        {maps_link}
      </td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold;">Trạng thái:</td>
      <td style="padding: 8px; color: #16a34a;">✅ Đã check-in</td>
    </tr>
  </table>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
    Gửi tự động bởi hệ thống QR Checklist
  </p>
</div>
"""


def _format_dt(dt: datetime) -> str:
    local = dt.astimezone(VN_TZ)
    return local.strftime("%d/%m/%Y %H:%M:%S")


def send_scan_email(
    location: str,
    scanned_at: datetime,
    device_id: str | None,
    lat: float | None = None,
    lng: float | None = None,
    geo_distance: float | None = None,
    geo_status: str = "no_gps",
) -> bool:
    if not RESEND_API_KEY:
        print("[email] RESEND_API_KEY chưa cấu hình, bỏ qua.")
        return False

    dt_str = _format_dt(scanned_at)
    device_label = (device_id[:30] + "...") if device_id and len(device_id) > 30 else (device_id or "Không rõ")

    if geo_status == "ok" and geo_distance is not None:
        geo_info = f"✅ Đúng trạm (cách {geo_distance:.0f}m)"
    elif geo_status == "no_gps":
        geo_info = "⚠️ Không có GPS"
    else:
        geo_info = f"⚠️ {geo_status}"

    maps_link = ""
    if lat is not None and lng is not None:
        maps_link = (
            f'<a href="https://maps.google.com/?q={lat},{lng}" '
            f'style="color: #2563eb; font-size: 12px;">(Xem bản đồ)</a>'
        )

    html_body = EMAIL_TEMPLATE.format(
        location=location,
        scanned_at=dt_str,
        device_id=device_label,
        geo_info=geo_info,
        maps_link=maps_link,
    )

    subject_local = scanned_at.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
    params = {
        "from": EMAIL_FROM,
        "to": [EMAIL_TO],
        "subject": f"[Checklist] {location} — {subject_local}",
        "html": html_body,
    }

    try:
        resend.Emails.send(params)
        return True
    except Exception as exc:
        print(f"[email] Gửi email thất bại: {exc}")
        return False
