import os
import threading
from datetime import datetime, timezone, timedelta

from sqlalchemy.exc import IntegrityError

from config import SessionLocal, PURGE_RETENTION_HOURS
from models import ScanLog
from services.email_service import send_scan_email
from services.anti_fraud_service import check_rate_limit

# False = gửi email đồng bộ (dùng cho test/debug). Mặc định gửi qua background
# thread để request /api/scan trả về ngay — Resend chậm/cold start không còn
# đẩy response vượt timeout 8s phía frontend (nguyên nhân ghi trùng scan cũ).
EMAIL_ASYNC = os.getenv("EMAIL_ASYNC", "true").lower() == "true"


def purge_cutoff(now: datetime | None = None, retention_hours: int | None = None) -> datetime:
    """Mốc thời gian auto-purge: bản ghi scan cũ hơn mốc này sẽ bị xóa.

    Mặc định dùng PURGE_RETENTION_HOURS (env, 720h = 30 ngày). Cho phép truyền
    retention_hours để test hoặc tinh chỉnh.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    hours = PURGE_RETENTION_HOURS if retention_hours is None else retention_hours
    return now - timedelta(hours=hours)


def _find_duplicate(session, device_id: str | None, location: str, dt: datetime):
    """Tìm scan đã lưu với cùng (device_id, location, scanned_at).

    Client giữ nguyên scanned_at khi retry (offline queue / timeout) nên bộ 3
    này định danh duy nhất 1 lần scan. Không có device_id thì không dedupe được.
    """
    if not device_id:
        return None
    return (
        session.query(ScanLog)
        .filter(
            ScanLog.device_id == device_id,
            ScanLog.location == location,
            ScanLog.scanned_at == dt,
        )
        .first()
    )


def _dedupe_response(existing: ScanLog) -> dict:
    return {
        "status": "ok",
        "scan_id": existing.id,
        "message": "Đã ghi nhận trước đó — bỏ qua bản trùng",
        "email_sent": existing.email_sent,
        "deduped": True,
    }


def _send_email_and_mark(scan_id, email_kwargs: dict) -> None:
    """Gửi email rồi cập nhật email_sent bằng session riêng (chạy ngoài request)."""
    ok, err = send_scan_email(**email_kwargs)
    if not ok:
        print(f"[scan] email lỗi cho scan {scan_id}: {err}")
    try:
        with SessionLocal() as session:
            log = session.get(ScanLog, scan_id)
            if log is not None:
                log.email_sent = ok
                session.commit()
    except Exception as e:  # chỉ log — email là kênh phụ, không được làm hỏng scan
        print(f"[scan] không cập nhật được email_sent cho scan {scan_id}: {e}")


def _dispatch_email(scan_id, email_kwargs: dict) -> None:
    """Đẩy việc gửi email ra background thread (hoặc đồng bộ nếu EMAIL_ASYNC=false)."""
    if EMAIL_ASYNC:
        threading.Thread(
            target=_send_email_and_mark, args=(scan_id, email_kwargs), daemon=True,
        ).start()
    else:
        _send_email_and_mark(scan_id, email_kwargs)


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
    location = location.strip()

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
        # --- Dedupe (PHẢI trước rate limit) ---
        # Retry từ offline queue gửi lại scan server đã lưu (frontend timeout 8s
        # nhưng server vẫn xử lý xong). Nếu để rate limit chạy trước, retry hợp lệ
        # có thể bị trả RATE_LIMITED dù bản ghi gốc đã nằm trong DB.
        existing = _find_duplicate(session, device_id, location, dt)
        if existing is not None:
            return _dedupe_response(existing)

        # --- Rate limiting ---
        rate_err = check_rate_limit(session, device_id, location)
        if rate_err:
            return rate_err

        # Auto-purge TRƯỚC khi insert — tránh xóa nhầm offline scan cũ vừa được đồng bộ.
        # Cửa sổ giữ data lấy từ PURGE_RETENTION_HOURS (mặc định 30 ngày).
        cutoff = purge_cutoff()
        session.query(ScanLog).filter(ScanLog.scanned_at < cutoff).delete(synchronize_session=False)

        log = ScanLog(
            location=location,
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
        try:
            session.add(log)
            session.flush()
            scan_id = log.id
            session.commit()
        except IntegrityError:
            # Race: 2 request trùng nhau cùng lúc — unique index uq_scan_logs_dedupe
            # chặn bản thứ hai. Trả về bản đã lưu như một dedupe bình thường.
            session.rollback()
            existing = _find_duplicate(session, device_id, location, dt)
            if existing is not None:
                return _dedupe_response(existing)
            raise

    # --- Email: NGOÀI session/transaction, mặc định chạy background thread ---
    # Request trả về ngay sau khi commit; email_sent cập nhật async vào DB
    # (trang Lịch sử / báo cáo đọc từ DB nên vẫn thấy trạng thái thật).
    _dispatch_email(scan_id, {
        "location": location,
        "scanned_at": dt,
        "device_id": device_id,
        "lat": lat,
        "lng": lng,
        "geo_distance": geo_distance,
        "geo_status": geo_status,
        "token_valid": token_valid,
        "cache_age_ms": cache_age_ms,
    })

    return {
        "status": "ok",
        "scan_id": scan_id,
        "message": "Đã ghi nhận — email sẽ được gửi tự động",
        # None = chưa biết (đang gửi nền). Frontend chỉ cảnh báo khi === false
        # nên giá trị None không kích hoạt thông báo lỗi sai.
        "email_sent": None,
    }
