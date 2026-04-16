import resend
from datetime import datetime
from zoneinfo import ZoneInfo
from config import RESEND_API_KEY, EMAIL_FROM, EMAIL_TO

resend.api_key = RESEND_API_KEY

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
      <td style="padding: 8px 12px; color: #16a34a; font-weight: bold;">✅ Đã check-in</td>
    </tr>
  </table>
  <p style="color: #6b7280; font-size: 11px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    Gửi tự động bởi hệ thống QR Checklist
  </p>
</div>
"""


def _format_dt(dt: datetime) -> str:
    return dt.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M:%S")


def send_scan_email(
    location: str,
    scanned_at: datetime,
    device_id: str | None,
    lat: float | None = None,
    lng: float | None = None,
    geo_distance: float | None = None,
    geo_status: str = "no_gps",
    token_valid: bool = False,
) -> bool:
    if not RESEND_API_KEY:
        print("[email] RESEND_API_KEY chưa cấu hình, bỏ qua.")
        return False

    device_label = (
        (device_id[:30] + "...") if device_id and len(device_id) > 30
        else (device_id or "Không rõ")
    )

    # GPS info
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
            f'style="color:#2563eb;font-size:12px;">(Xem bản đồ)</a>'
        )

    # Token / anti-fraud info
    if token_valid:
        token_info = "✅ Rotating QR hợp lệ"
    else:
        token_info = "⚠️ QR tĩnh (không xác thực thời gian)"

    subject_time = scanned_at.astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
    params = {
        "from": EMAIL_FROM,
        "to": [EMAIL_TO],
        "subject": f"[Checklist] {location} — {subject_time}",
        "html": EMAIL_TEMPLATE.format(
            location=location,
            scanned_at=_format_dt(scanned_at),
            device_id=device_label,
            geo_info=geo_info,
            maps_link=maps_link,
            token_info=token_info,
        ),
    }

    try:
        print(f"[email] Gửi đến {EMAIL_TO} from={EMAIL_FROM} subject={params['subject']!r}")
        resp = resend.Emails.send(params)
        print(f"[email] OK — response: {resp}")
        return True
    except Exception as exc:
        import traceback
        print(f"[email] FAIL: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        return False
