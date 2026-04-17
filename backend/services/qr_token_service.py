"""
Rotating QR token — chống gian lận bằng cách chụp ảnh QR.

Nguyên lý:
  - Mỗi trạm có một token thay đổi mỗi WINDOW giây (mặc định 5 phút)
  - Token = HMAC-SHA256(station_name + time_window, SECRET_KEY)[:16]
  - QR content: "STATION_NAME|TOKEN" (thay vì chỉ "STATION_NAME")
  - Backend validate: token phải khớp với window hiện tại HOẶC window trước
    (cho phép 1 window trước để tránh lỗi nếu nhân viên quét đúng lúc token đổi)
  - Ảnh chụp QR hết hiệu lực sau tối đa 2×WINDOW = 10 phút

Thiết lập:
  - Set QR_SECRET trong .env (chuỗi ngẫu nhiên dài ≥ 32 ký tự)
  - Set QR_WINDOW_SECONDS nếu muốn thay đổi chu kỳ (mặc định 300 = 5 phút)
  - Đặt màn hình/tablet tại mỗi trạm, mở trang /station/STATION_NAME
"""
import hmac
import hashlib
import time
import os

SECRET_KEY = os.getenv("QR_SECRET", "CHANGE_ME_IN_PRODUCTION_USE_RANDOM_32_CHARS")
WINDOW_SECONDS = int(os.getenv("QR_WINDOW_SECONDS", "300"))  # 5 phút


def _current_window(offset: int = 0) -> int:
    """Trả về index của time window hiện tại (+ offset)."""
    return int(time.time()) // WINDOW_SECONDS + offset


def _seconds_until_next_rotation() -> int:
    """Số giây còn lại cho đến khi token đổi."""
    return WINDOW_SECONDS - (int(time.time()) % WINDOW_SECONDS)


def generate_token(station_name: str, window: int | None = None) -> str:
    """Tạo token HMAC cho một trạm tại một time window."""
    if window is None:
        window = _current_window()
    msg = f"{station_name}:{window}".encode("utf-8")
    return hmac.new(
        SECRET_KEY.encode("utf-8"), msg, hashlib.sha256
    ).hexdigest()[:16]


def current_qr_content(station_name: str) -> dict:
    """
    Trả về nội dung QR hiện tại và metadata cho display page.
    QR content format: "STATION_NAME|TOKEN"
    """
    token = generate_token(station_name)
    return {
        "qr_content": f"{station_name}|{token}",
        "station": station_name,
        "token": token,
        "expires_in": _seconds_until_next_rotation(),
        "window_seconds": WINDOW_SECONDS,
    }


def validate_token(station_name: str, token: str) -> bool:
    """
    Kiểm tra token có hợp lệ không.
    Chấp nhận window hiện tại và window trước (tránh lỗi biên thời gian).
    Dùng hmac.compare_digest để chống timing attack.
    """
    if not token:
        return False
    for offset in (0, -1):
        expected = generate_token(station_name, _current_window(offset))
        if hmac.compare_digest(token, expected):
            return True
    return False


def parse_qr_content(raw: str) -> tuple[str, str | None]:
    """
    Parse nội dung QR.
    - Format mới:  "STATION_NAME|TOKEN" → trả về (station_name, token)
    - Format cũ:   "STATION_NAME"       → trả về (station_name, None)
    - Format alias: nội dung QR bất kỳ được map trong QR_ALIAS_MAP
                    → trả về (mapped_station_name, None)
    """
    from services.stations_db import get_qr_aliases
    QR_ALIAS_MAP = get_qr_aliases()

    raw = raw.strip()

    # Kiểm tra alias trước — QR cũ dùng cho mục đích khác
    if raw in QR_ALIAS_MAP:
        return QR_ALIAS_MAP[raw], None

    # Kiểm tra alias theo suffix URL (nếu QR là URL dài, chỉ cần map phần path)
    for alias, station in QR_ALIAS_MAP.items():
        if alias.startswith("/") and raw.endswith(alias):
            return station, None

    # Format chuẩn của app
    parts = raw.split("|", 1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return parts[0].strip(), None
