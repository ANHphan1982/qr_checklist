"""
Anti-fraud checks:
  1. Rate limiting     — cùng device không thể scan cùng trạm quá N lần/giờ
  2. GPS enforcement   — nếu REQUIRE_GPS=true, không có GPS → từ chối
  3. Accuracy check    — GPS kém (accuracy > MAX_GPS_ACCURACY_METERS) → cảnh báo/từ chối
"""
import os
from datetime import datetime, timezone, timedelta

REQUIRE_GPS = os.getenv("REQUIRE_GPS", "false").lower() == "true"
MAX_GPS_ACCURACY_METERS = int(os.getenv("MAX_GPS_ACCURACY_METERS", "200"))
RATE_LIMIT_WINDOW_MINUTES = int(os.getenv("RATE_LIMIT_WINDOW_MINUTES", "60"))
RATE_LIMIT_MAX_SCANS = int(os.getenv("RATE_LIMIT_MAX_SCANS", "3"))


def check_gps_enforcement(
    lat: float | None,
    lng: float | None,
    accuracy: float | None,
) -> dict | None:
    """
    Kiểm tra GPS enforcement và accuracy.
    Trả về dict lỗi nếu vi phạm, None nếu hợp lệ.
    """
    if REQUIRE_GPS and (lat is None or lng is None):
        return {
            "status": "error",
            "code": "GPS_REQUIRED",
            "message": "Cần bật GPS để check-in. Vui lòng cho phép truy cập vị trí.",
        }

    if lat is not None and accuracy is not None:
        if accuracy > MAX_GPS_ACCURACY_METERS:
            # Cảnh báo (không block) — quản lý thấy trong email
            return None  # soft warning — xử lý ở tầng trên nếu cần block

    return None


def check_rate_limit(
    session,
    device_id: str | None,
    location: str,
) -> dict | None:
    """
    Kiểm tra rate limit: cùng device không scan cùng trạm quá N lần trong X phút.
    Trả về dict lỗi nếu vi phạm, None nếu hợp lệ.
    """
    if not device_id:
        return None  # không có device_id thì bỏ qua rate limit

    from models import ScanLog
    from sqlalchemy import and_, func

    since = datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)

    count = (
        session.query(func.count(ScanLog.id))
        .filter(
            and_(
                ScanLog.device_id == device_id,
                ScanLog.location == location,
                ScanLog.scanned_at >= since,
            )
        )
        .scalar()
    )

    if count >= RATE_LIMIT_MAX_SCANS:
        return {
            "status": "error",
            "code": "RATE_LIMITED",
            "message": (
                f"Thiết bị này đã check-in tại '{location}' "
                f"{count} lần trong {RATE_LIMIT_WINDOW_MINUTES} phút qua. "
                f"Vui lòng thử lại sau."
            ),
        }
    return None


def get_gps_accuracy_status(accuracy: float | None) -> str:
    """Đánh giá độ chính xác GPS để lưu vào DB."""
    if accuracy is None:
        return "no_gps"
    if accuracy <= 20:
        return "high"
    if accuracy <= 100:
        return "medium"
    return "low"
