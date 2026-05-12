"""
Admin API — quản lý stations và QR aliases.
Bảo vệ bằng header X-Admin-Key khớp với ADMIN_SECRET env var.
"""
from flask import Blueprint, request, jsonify
from config import SessionLocal, ADMIN_SECRET
from models import Station, QrAlias, StationParam, ScanLog
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
from services.stations_config import STATION_PARAMS as STATIC_STATION_PARAMS

admin_bp = Blueprint("admin", __name__)


def _auth():
    """Trả về None nếu OK, Response lỗi nếu không hợp lệ."""
    if not ADMIN_SECRET:
        return jsonify({"error": "ADMIN_SECRET chưa cấu hình trên server"}), 500
    key = request.headers.get("X-Admin-Key", "")
    if key != ADMIN_SECRET:
        return jsonify({"error": "Unauthorized"}), 401
    return None


def _db_unavailable():
    return jsonify({"error": "Database không khả dụng"}), 503


# ---------------------------------------------------------------------------
# Stations
# ---------------------------------------------------------------------------

@admin_bp.route("/admin/stations", methods=["GET"])
def list_stations():
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        rows = s.query(Station).order_by(Station.name).all()
    return jsonify([r.to_dict() for r in rows])


@admin_bp.route("/admin/stations", methods=["POST"])
def create_station():
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()

    data = request.get_json(silent=True) or {}
    name       = (data.get("name") or "").strip().upper()
    lat        = data.get("lat")
    lng        = data.get("lng")
    qr_content = (data.get("qr_content") or "").strip()

    if not name or lat is None or lng is None:
        return jsonify({"error": "Thiếu name, lat hoặc lng"}), 400
    try:
        lat, lng = float(lat), float(lng)
    except (ValueError, TypeError):
        return jsonify({"error": "lat/lng phải là số"}), 400

    radius = int(data.get("radius") or 300)

    try:
        with SessionLocal() as s:
            st = Station(name=name, lat=lat, lng=lng, radius=radius)
            s.add(st)
            if qr_content:
                alias = QrAlias(qr_content=qr_content, station_name=name, note=None)
                s.add(alias)
            s.commit()
            s.refresh(st)
            return jsonify(st.to_dict()), 201
    except IntegrityError:
        return jsonify({"error": f"Trạm '{name}' hoặc QR '{qr_content}' đã tồn tại"}), 409


@admin_bp.route("/admin/stations/<name>", methods=["PUT"])
def update_station(name):
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()

    data = request.get_json(silent=True) or {}
    with SessionLocal() as s:
        st = s.query(Station).filter(Station.name == name.upper()).first()
        if not st:
            return jsonify({"error": "Không tìm thấy trạm"}), 404
        if data.get("lat") is not None:
            st.lat = float(data["lat"])
        if data.get("lng") is not None:
            st.lng = float(data["lng"])
        if data.get("radius") is not None:
            st.radius = int(data["radius"])
        if data.get("active") is not None:
            st.active = bool(data["active"])
        s.commit()
        s.refresh(st)
        return jsonify(st.to_dict())


@admin_bp.route("/admin/stations/<name>", methods=["DELETE"])
def delete_station(name):
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        st = s.query(Station).filter(Station.name == name.upper()).first()
        if not st:
            return jsonify({"error": "Không tìm thấy trạm"}), 404
        # Soft delete
        st.active = False
        s.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# QR Aliases
# ---------------------------------------------------------------------------

@admin_bp.route("/admin/qr-aliases", methods=["GET"])
def list_aliases():
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        rows = s.query(QrAlias).order_by(QrAlias.station_name, QrAlias.qr_content).all()
    return jsonify([r.to_dict() for r in rows])


@admin_bp.route("/admin/qr-aliases", methods=["POST"])
def create_alias():
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()

    data = request.get_json(silent=True) or {}
    qr_content   = (data.get("qr_content") or "").strip()
    station_name = (data.get("station_name") or "").strip().upper()
    note         = (data.get("note") or "").strip()

    if not qr_content or not station_name:
        return jsonify({"error": "Thiếu qr_content hoặc station_name"}), 400

    try:
        with SessionLocal() as s:
            alias = QrAlias(qr_content=qr_content, station_name=station_name, note=note or None)
            s.add(alias)
            s.commit()
            s.refresh(alias)
            return jsonify(alias.to_dict()), 201
    except IntegrityError:
        return jsonify({"error": f"QR '{qr_content}' đã tồn tại"}), 409


@admin_bp.route("/admin/qr-aliases/<int:alias_id>", methods=["DELETE"])
def delete_alias(alias_id):
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        alias = s.query(QrAlias).filter(QrAlias.id == alias_id).first()
        if not alias:
            return jsonify({"error": "Không tìm thấy alias"}), 404
        s.delete(alias)
        s.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Station Params (thông số vận hành)
# ---------------------------------------------------------------------------

@admin_bp.route("/admin/station-params", methods=["GET"])
def list_station_params():
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        rows = s.query(StationParam).order_by(StationParam.station_name).all()
    return jsonify([r.to_dict() for r in rows])


@admin_bp.route("/admin/station-params", methods=["POST"])
def create_station_param():
    err = _auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    station_name = (data.get("station_name") or "").strip().upper()
    param_label  = (data.get("param_label") or "Thông số").strip()
    param_unit   = (data.get("param_unit") or "mm").strip()

    def _to_float_or_none(val):
        try:
            return float(val) if val not in (None, "") else None
        except (TypeError, ValueError):
            return None

    param_low  = _to_float_or_none(data.get("param_low"))
    param_high = _to_float_or_none(data.get("param_high"))

    if not station_name:
        return jsonify({"error": "Thiếu station_name"}), 400

    if station_name in STATIC_STATION_PARAMS:
        return jsonify({"error": f"Trạm '{station_name}' đã được cấu hình sẵn trong config — không thể thay đổi qua admin"}), 409

    if not SessionLocal:
        return _db_unavailable()

    try:
        with SessionLocal() as s:
            sp = StationParam(station_name=station_name, param_label=param_label, param_unit=param_unit,
                              param_low=param_low, param_high=param_high)
            s.add(sp)
            s.commit()
            s.refresh(sp)
            return jsonify(sp.to_dict()), 201
    except IntegrityError:
        return jsonify({"error": f"Trạm '{station_name}' đã có cấu hình thông số"}), 409


@admin_bp.route("/admin/station-params/<int:param_id>", methods=["PUT"])
def update_station_param(param_id):
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()

    data = request.get_json(silent=True) or {}
    with SessionLocal() as s:
        sp = s.get(StationParam, param_id)
        if not sp:
            return jsonify({"error": "Không tìm thấy cấu hình"}), 404
        if sp.station_name in STATIC_STATION_PARAMS:
            return jsonify({"error": f"Trạm '{sp.station_name}' đã được cấu hình sẵn trong config — không thể thay đổi qua admin"}), 409
        def _to_float_or_none(val):
            try:
                return float(val) if val not in (None, "") else None
            except (TypeError, ValueError):
                return None

        if data.get("param_label") is not None:
            sp.param_label = data["param_label"].strip()
        if data.get("param_unit") is not None:
            sp.param_unit = data["param_unit"].strip()
        if "param_low" in data:
            sp.param_low = _to_float_or_none(data["param_low"])
        if "param_high" in data:
            sp.param_high = _to_float_or_none(data["param_high"])
        if data.get("active") is not None:
            sp.active = bool(data["active"])
        s.commit()
        s.refresh(sp)
        return jsonify(sp.to_dict())


@admin_bp.route("/admin/station-params/<int:param_id>", methods=["DELETE"])
def delete_station_param(param_id):
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()
    with SessionLocal() as s:
        sp = s.get(StationParam, param_id)
        if not sp:
            return jsonify({"error": "Không tìm thấy cấu hình"}), 404
        s.delete(sp)
        s.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Purge — xóa scan_logs cũ để giải phóng dung lượng Supabase
# ---------------------------------------------------------------------------

@admin_bp.route("/admin/purge", methods=["POST"])
def purge_old_scans():
    """Xóa bản ghi scan_logs cũ hơn N ngày. Mặc định 7 ngày."""
    err = _auth()
    if err:
        return err
    if not SessionLocal:
        return _db_unavailable()

    data = request.get_json(silent=True) or {}
    try:
        days = int(data.get("older_than_days", 7))
    except (ValueError, TypeError):
        return jsonify({"error": "older_than_days phải là số nguyên"}), 400

    if days < 1:
        return jsonify({"error": "older_than_days phải >= 1"}), 400

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with SessionLocal() as s:
        deleted = s.query(ScanLog).filter(ScanLog.scanned_at < cutoff).delete(synchronize_session=False)
        s.commit()

    return jsonify({"status": "ok", "deleted": deleted, "older_than_days": days})
