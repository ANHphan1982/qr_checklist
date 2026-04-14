from datetime import datetime, timezone
from config import SessionLocal
from models import ScanLog
from services.email_service import send_scan_email
from services.anti_fraud_service import check_rate_limit


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
) -> dict:
    if not location or not location.strip():
        return {"status": "error", "message": "Thiếu trường location"}

    if scanned_at:
        try:
            dt = datetime.fromisoformat(scanned_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return {"status": "error", "message": "scanned_at không hợp lệ (dùng ISO 8601)"}
    else:
        dt = datetime.now(timezone.utc)

    with SessionLocal() as session:
        # --- Rate limiting ---
        rate_err = check_rate_limit(session, device_id, location.strip())
        if rate_err:
            return rate_err

        log = ScanLog(
            location=location.strip(),
            device_id=device_id,
            lat=lat,
            lng=lng,
            gps_accuracy=accuracy,
            geo_distance=geo_distance,
            geo_status=geo_status,
            token_valid=token_valid,
            scanned_at=dt,
            email_sent=False,
        )
        session.add(log)
        session.flush()
        scan_id = log.id

        email_ok = send_scan_email(
            location=location.strip(),
            scanned_at=dt,
            device_id=device_id,
            lat=lat,
            lng=lng,
            geo_distance=geo_distance,
            geo_status=geo_status,
            token_valid=token_valid,
        )
        log.email_sent = email_ok
        session.commit()

    return {
        "status": "ok",
        "scan_id": scan_id,
        "message": "Đã ghi nhận và gửi email" if email_ok else "Đã ghi nhận (email chưa gửi được)",
    }
