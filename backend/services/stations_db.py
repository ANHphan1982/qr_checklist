"""
Load STATIONS và QR_ALIAS_MAP từ DB (Supabase).
Fallback về stations_config.py nếu DB trống hoặc không kết nối được.
"""
from config import SessionLocal
from models import Station, QrAlias
from services.stations_config import STATIONS as _STATIC_STATIONS, QR_ALIAS_MAP as _STATIC_ALIASES


def get_stations() -> dict:
    """Trả về dict {name: {lat, lng, radius}} — merge DB + static (DB thắng khi trùng tên)."""
    merged = dict(_STATIC_STATIONS)  # luôn bắt đầu từ static config
    if SessionLocal is None:
        return merged
    try:
        with SessionLocal() as s:
            rows = s.query(Station).filter(Station.active == True).all()
        for r in rows:
            merged[r.name] = {"lat": r.lat, "lng": r.lng, "radius": r.radius}
    except Exception as e:
        print(f"[stations_db] get_stations DB error: {e}")
    return merged


def get_qr_aliases() -> dict:
    """Trả về dict {qr_content: station_name} — merge DB + file (DB thắng)."""
    merged = dict(_STATIC_ALIASES)
    if SessionLocal is None:
        return merged
    try:
        with SessionLocal() as s:
            rows = s.query(QrAlias).all()
        for r in rows:
            merged[r.qr_content] = r.station_name
    except Exception as e:
        print(f"[stations_db] get_qr_aliases DB error: {e}")
    return merged
