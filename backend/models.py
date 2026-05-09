from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Float, Integer, func
from config import Base


class ScanLog(Base):
    __tablename__ = "scan_logs"

    id           = Column(BigInteger, primary_key=True, index=True)
    location     = Column(String(200), nullable=False)
    device_id    = Column(String(500))
    lat          = Column(Float, nullable=True)
    lng          = Column(Float, nullable=True)
    gps_accuracy = Column(Float, nullable=True)   # độ chính xác GPS (mét)
    geo_distance = Column(Float, nullable=True)   # khoảng cách thực tế đến trạm (mét)
    geo_status   = Column(String(20), default="no_gps")  # ok | out_of_range | unverified | cached | no_gps
    token_valid  = Column(Boolean, default=False)  # True = dùng Rotating QR hợp lệ
    oil_level_mm = Column(Float, nullable=True)    # Mức dầu (mm) — TK-5203A, TK-5205A
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
            "scanned_at": self.scanned_at.isoformat() if self.scanned_at else None,
            "email_sent": self.email_sent,
        }


class Station(Base):
    __tablename__ = "stations"

    id         = Column(BigInteger, primary_key=True, index=True)
    name       = Column(String(100), nullable=False, unique=True)
    lat        = Column(Float, nullable=False)
    lng        = Column(Float, nullable=False)
    radius     = Column(Integer, default=300)
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "radius": self.radius,
            "active": self.active,
        }


class StationParam(Base):
    """Cấu hình thông số vận hành cần nhập sau khi check-in tại một trạm."""
    __tablename__ = "station_params"

    id           = Column(BigInteger, primary_key=True, index=True)
    station_name = Column(String(100), nullable=False, unique=True)
    param_label  = Column(String(100), nullable=False, default="Thông số")
    param_unit   = Column(String(50),  nullable=False, default="mm")
    active       = Column(Boolean, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "station_name": self.station_name,
            "param_label": self.param_label,
            "param_unit": self.param_unit,
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
