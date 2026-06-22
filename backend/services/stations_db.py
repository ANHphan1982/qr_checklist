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

    Một trạm có thể có NHIỀU thông số. Merge static + DB: nếu một trạm có BẤT KỲ
    bản ghi nào trong DB thì DB nắm TOÀN QUYỀN trạm đó — danh sách thông số = các
    bản ghi đang bật (active). Nếu admin tắt HẾT thông số của trạm, danh sách trả
    về rỗng ([]) và vẫn override static/builtin → khi scan không hiện modal nữa.
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
            rows = s.query(StationParam).all()
        # Trạm xuất hiện trong DB (kể cả khi mọi thông số đã tắt) → DB nắm toàn quyền.
        managed_stations: set = set()
        active_by_station: dict = {}
        for r in rows:
            managed_stations.add(r.station_name)
            if r.active:
                active_by_station.setdefault(r.station_name, []).append({
                    "id":          r.id,
                    "tag":         r.tag,
                    "param_label": r.param_label,
                    "param_unit":  r.param_unit,
                    "param_low":   r.param_low,
                    "param_high":  r.param_high,
                    "sort_order":  r.sort_order or 0,
                })
        for station_name in managed_stations:
            params = active_by_station.get(station_name, [])
            params.sort(key=lambda p: (p["sort_order"], p["id"] or 0))
            merged[station_name] = {"station_name": station_name, "params": params}
    except Exception as e:
        print(f"[stations_db] get_station_params DB error: {e}")
    return merged


def get_checklist_assignments() -> dict:
    """Trả {checklist_type: [station_name, ...]} từ DB.

    Chỉ gồm trạm đang active có gán checklist_type. Public endpoint dùng để mọi
    thiết bị đọc chung mapping (thay cho localStorage riêng từng máy). Không có DB
    → trả {} (offline-safe).
    """
    result: dict = {}
    if SessionLocal is None:
        return result
    try:
        with SessionLocal() as s:
            rows = s.query(Station).filter(Station.active == True).all()
        for r in rows:
            ct = getattr(r, "checklist_type", None)
            if ct:
                result.setdefault(ct, []).append(r.name)
    except Exception as e:
        print(f"[stations_db] get_checklist_assignments DB error: {e}")
    return result


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
