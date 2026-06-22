from sqlalchemy import (
    Column, BigInteger, String, Boolean, DateTime, Float, Integer, JSON, func,
    Index, text,
)
from config import Base


class ScanLog(Base):
    __tablename__ = "scan_logs"

    # Index tối ưu cho free tier:
    #  - idx_scan_logs_scanned_at: tăng tốc reports/summary/purge (lọc + sắp theo thời gian)
    #  - idx_scan_logs_device_loc_time: tăng tốc rate-limit (device + trạm + thời gian)
    #  - uq_scan_logs_dedupe: chặn duplicate khi client retry (timeout 8s phía frontend
    #    → offline queue gửi lại scan đã lưu). Client giữ nguyên scanned_at khi retry
    #    nên bộ 3 này định danh duy nhất 1 lần scan. NULL device_id không bị ràng buộc
    #    (Postgres coi NULL là distinct) — chấp nhận được vì frontend luôn gửi device_id.
    __table_args__ = (
        Index("idx_scan_logs_scanned_at", "scanned_at"),
        Index("idx_scan_logs_device_loc_time", "device_id", "location", "scanned_at"),
        Index("uq_scan_logs_dedupe", "device_id", "location", "scanned_at", unique=True),
    )

    id           = Column(BigInteger, primary_key=True, index=True)
    location     = Column(String(200), nullable=False)
    device_id    = Column(String(500))
    lat          = Column(Float, nullable=True)
    lng          = Column(Float, nullable=True)
    gps_accuracy = Column(Float, nullable=True)   # độ chính xác GPS (mét)
    geo_distance = Column(Float, nullable=True)   # khoảng cách thực tế đến trạm (mét)
    geo_status   = Column(String(20), default="no_gps")  # ok | out_of_range | unverified | cached | no_gps
    token_valid  = Column(Boolean, default=False)  # True = dùng Rotating QR hợp lệ
    oil_level_mm = Column(Float, nullable=True)    # Mức dầu (mm) — backward compat, = giá trị param đầu tiên
    # param_values: danh sách thông số vận hành nhập tại trạm (multi-param).
    # Mỗi phần tử tự mô tả: {tag, label, unit, value, low, high} — không cần join
    # lại config khi xuất Excel, kể cả khi config thay đổi sau này.
    param_values = Column(JSON, nullable=True)
    scanned_at   = Column(DateTime(timezone=True), server_default=func.now())
    email_sent   = Column(Boolean, default=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "location": self.location,
            "device_id": self.device_id,
            "lat": self.lat,
            "lng": self.lng,
            "gps_accuracy": self.gps_accuracy,
            "geo_distance": self.geo_distance,
            "geo_status": self.geo_status,
            "token_valid": self.token_valid,
            "oil_level_mm": self.oil_level_mm,
            "param_values": self.param_values or [],
            "scanned_at": self.scanned_at.isoformat() if self.scanned_at else None,
            "email_sent": self.email_sent,
        }


class Station(Base):
    __tablename__ = "stations"

    id             = Column(BigInteger, primary_key=True, index=True)
    name           = Column(String(100), nullable=False, unique=True)
    lat            = Column(Float, nullable=False)
    lng            = Column(Float, nullable=False)
    radius         = Column(Integer, default=300)
    active         = Column(Boolean, default=True)
    # Loại checklist trạm thuộc về (pump/tank/routine/valve/safety/elec...).
    # NULL = chưa gán. Lưu ở DB để mọi thiết bị đọc chung (qua /api/checklist-stations).
    checklist_type = Column(String(50), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "radius": self.radius,
            "active": self.active,
            "checklist_type": self.checklist_type,
        }


class StationParam(Base):
    """Cấu hình MỘT thông số vận hành cần nhập sau khi check-in tại một trạm.

    Một trạm có thể có NHIỀU dòng thông số (vd PUMP_STATION_6 có áp suất, nhiệt độ,
    dòng điện...). Vì vậy station_name KHÔNG còn unique — phân biệt bằng id, và
    `tag` (mã thiết bị, vd "052-PG-038") để hiển thị/đối chiếu trong báo cáo.
    """
    __tablename__ = "station_params"

    id           = Column(BigInteger, primary_key=True, index=True)
    station_name = Column(String(100), nullable=False, index=True)
    tag          = Column(String(100), nullable=True)   # mã thiết bị, vd "052-PG-038"
    param_label  = Column(String(100), nullable=False, default="Thông số")
    param_unit   = Column(String(50),  nullable=False, default="mm")
    param_low    = Column(Float, nullable=True)   # giới hạn dưới (L)
    param_high   = Column(Float, nullable=True)   # giới hạn trên (H)
    sort_order   = Column(Integer, default=0)     # thứ tự hiển thị trong modal
    active       = Column(Boolean, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "station_name": self.station_name,
            "tag": self.tag,
            "param_label": self.param_label,
            "param_unit": self.param_unit,
            "param_low": self.param_low,
            "param_high": self.param_high,
            "sort_order": self.sort_order or 0,
            "active": self.active,
        }


class QrAlias(Base):
    __tablename__ = "qr_aliases"

    id           = Column(BigInteger, primary_key=True, index=True)
    qr_content   = Column(String(500), nullable=False, unique=True)
    station_name = Column(String(100), nullable=False)
    note         = Column(String(200))
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "qr_content": self.qr_content,
            "station_name": self.station_name,
            "note": self.note or "",
        }


# ---------------------------------------------------------------------------
# Index bootstrap cho bảng prod đang tồn tại.
#
# Production chạy qua Gunicorn nên Base.metadata.create_all (chỉ chạy ở __main__)
# KHÔNG được gọi → index khai báo trong __table_args__ không tự áp lên bảng cũ.
# Hàm này phát CREATE INDEX IF NOT EXISTS lúc khởi động: idempotent, an toàn chạy
# lại mỗi lần boot, không sập app nếu lỗi (vd thiếu quyền / DB tạm gián đoạn).
# ---------------------------------------------------------------------------

_SCAN_LOG_INDEX_DDL = (
    "CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at "
    "ON scan_logs (scanned_at)",
    "CREATE INDEX IF NOT EXISTS idx_scan_logs_device_loc_time "
    "ON scan_logs (device_id, location, scanned_at)",
    # Có thể fail nếu DB đang chứa sẵn bản ghi trùng — khi đó dedupe tầng app
    # trong scan_service vẫn hoạt động; dọn bản ghi trùng rồi index sẽ tạo được.
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_scan_logs_dedupe "
    "ON scan_logs (device_id, location, scanned_at)",
)


def ensure_scan_log_indexes(engine) -> None:
    """Đảm bảo index của scan_logs tồn tại trên DB (idempotent, nuốt lỗi).

    Mỗi DDL chạy trong transaction riêng — một câu fail (vd unique index gặp
    data trùng có sẵn) không chặn các index còn lại.
    """
    if engine is None:
        return
    for ddl in _SCAN_LOG_INDEX_DDL:
        try:
            with engine.begin() as conn:
                conn.execute(text(ddl))
        except Exception as e:  # pragma: no cover - chỉ log, không sập app
            print(f"[models] ensure_scan_log_indexes lỗi (bỏ qua): {ddl.split(' ON ')[0]} → {e}")


# Cột thêm sau cho bảng stations đang tồn tại (giống ensure_scan_log_indexes):
# Postgres không có "ADD COLUMN IF NOT EXISTS" cho mọi phiên bản cũ, nhưng
# Supabase (PG ≥ 9.6) hỗ trợ — idempotent, an toàn chạy lại mỗi lần boot.
_STATION_COLUMN_DDL = (
    "ALTER TABLE stations ADD COLUMN IF NOT EXISTS checklist_type VARCHAR(50)",
)


def ensure_station_columns(engine) -> None:
    """Thêm cột mới cho stations nếu chưa có (idempotent, nuốt lỗi)."""
    if engine is None:
        return
    for ddl in _STATION_COLUMN_DDL:
        try:
            with engine.begin() as conn:
                conn.execute(text(ddl))
        except Exception as e:  # pragma: no cover - chỉ log, không sập app
            print(f"[models] ensure_station_columns lỗi (bỏ qua): {ddl} → {e}")
