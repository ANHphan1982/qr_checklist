"""
Load STATIONS và QR_ALIAS_MAP từ DB (Supabase).
Fallback về stations_config.py nếu DB trống hoặc không kết nối được.
"""
from config import SessionLocal
from models import Station, QrAlias
from services.stations_config import (
    STATIONS as _STATIC_STATIONS,
    QR_ALIAS_MAP as _STATIC_ALIASES,
    STATION_PARAMS as _STATIC_PARAMS,
)


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


def _static_param_entry(name: str, cfg: dict) -> dict:
    """Bọc static config (1 thông số/trạm) vào shape grouped {station_name, params:[...]}."""
    return {
        "station_name": name,
        "params": [{
            "id":          None,
            "tag":         cfg.get("tag"),
            "param_label": cfg.get("param_label", "Thông số"),
            "param_unit":  cfg.get("param_unit", "mm"),
            "param_low":   cfg.get("param_low"),
            "param_high":  cfg.get("param_high"),
            "sort_order":  0,
        }],
    }


def get_station_params() -> dict:
    """Trả về {station_name: {station_name, params: [ {...}, ... ]}}.

    Một trạm có thể có NHIỀU thông số. Merge static + DB: nếu một trạm có bản ghi
    trong DB thì DB thay thế hoàn toàn danh sách thông số static của trạm đó.
    """
    merged: dict = {
        name: _static_param_entry(name, cfg)
        for name, cfg in _STATIC_PARAMS.items()
    }
    if SessionLocal is None:
        return merged
    try:
        with SessionLocal() as s:
            from models import StationParam
            rows = s.query(StationParam).filter_by(active=True).all()
        db_by_station: dict = {}
        for r in rows:
            db_by_station.setdefault(r.station_name, []).append({
                "id":          r.id,
                "tag":         r.tag,
                "param_label": r.param_label,
                "param_unit":  r.param_unit,
                "param_low":   r.param_low,
                "param_high":  r.param_high,
                "sort_order":  r.sort_order or 0,
            })
        for station_name, params in db_by_station.items():
            params.sort(key=lambda p: (p["sort_order"], p["id"] or 0))
            merged[station_name] = {"station_name": station_name, "params": params}
    except Exception as e:
        print(f"[stations_db] get_station_params DB error: {e}")
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
