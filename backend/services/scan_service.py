from datetime import datetime, timezone, timedelta
from config import SessionLocal, PURGE_RETENTION_HOURS
from models import ScanLog
from services.email_service import send_scan_email
from services.anti_fraud_service import check_rate_limit


def purge_cutoff(now: datetime | None = None, retention_hours: int | None = None) -> datetime:
    """Mốc thời gian auto-purge: bản ghi scan cũ hơn mốc này sẽ bị xóa.

    Mặc định dùng PURGE_RETENTION_HOURS (env, 720h = 30 ngày). Cho phép truyền
    retention_hours để test hoặc tinh chỉnh.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    hours = PURGE_RETENTION_HOURS if retention_hours is None else retention_hours
    return now - timedelta(hours=hours)


def process_scan(
    location: str,
    device_id: str | None = None,
    scanned_at: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    accuracy: float | None = None,
    geo_distance: float | None = None,
    geo_status: str = "no_gps",
    token_valid: bool = False,
    cache_age_ms: float | None = None,
    oil_level_mm: float | None = None,
    param_values: list | None = None,
) -> dict:
    if not location or not location.strip():
        return {"status": "error", "message": "Thiếu trường location"}

    if scanned_at:
        try:
            # Python ≤3.10 không nhận suffix "Z" — normalize trước khi parse
            normalized = scanned_at.strip()
            if normalized.endswith("Z"):
                normalized = normalized[:-1] + "+00:00"
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return {"status": "error", "message": "scanned_at không hợp lệ (dùng ISO 8601)"}
    else:
        dt = datetime.now(timezone.utc)

    # Backward compat: nếu client mới gửi param_values mà không gửi oil_level_mm,
    # lấy giá trị số đầu tiên làm oil_level_mm để email / báo cáo cũ vẫn có dữ liệu.
    if oil_level_mm is None and param_values:
        for pv in param_values:
            v = pv.get("value") if isinstance(pv, dict) else None
            if isinstance(v, (int, float)):
                oil_level_mm = float(v)
                break

    with SessionLocal() as session:
        # --- Rate limiting ---
        rate_err = check_rate_limit(session, device_id, location.strip())
        if rate_err:
            return rate_err

        # Auto-purge TRƯỚC khi insert — tránh xóa nhầm offline scan cũ vừa được đồng bộ.
        # Cửa sổ giữ data lấy từ PURGE_RETENTION_HOURS (mặc định 30 ngày).
        cutoff = purge_cutoff()
        session.query(ScanLog).filter(ScanLog.scanned_at < cutoff).delete(synchronize_session=False)

        log = ScanLog(
            location=location.strip(),
            device_id=device_id,
            lat=lat,
            lng=lng,
            gps_accuracy=accuracy,
            geo_distance=geo_distance,
            geo_status=geo_status,
            token_valid=token_valid,
            oil_level_mm=oil_level_mm,
            param_values=param_values or None,
            scanned_at=dt,
            email_sent=False,
        )
        session.add(log)
        session.flush()
        scan_id = log.id

        # Gửi email cho tất cả trạng thái (kể cả out_of_range để quản lý biết gian dối)
        email_ok, email_err = send_scan_email(
            location=location.strip(),
            scanned_at=dt,
            device_id=device_id,
            lat=lat,
            lng=lng,
            geo_distance=geo_distance,
            geo_status=geo_status,
            token_valid=token_valid,
            cache_age_ms=cache_age_ms,
        )
        log.email_sent = email_ok

        session.commit()

    if email_ok:
        msg = "Đã ghi nhận và gửi email"
    else:
        msg = f"Đã ghi nhận (email lỗi: {email_err})"

    return {
        "status": "ok",
        "scan_id": scan_id,
        "message": msg,
        "email_sent": email_ok,
    }
