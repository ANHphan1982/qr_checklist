"""
Admin API — quản lý stations và QR aliases.
Bảo vệ bằng header X-Admin-Key khớp với ADMIN_SECRET env var.
"""
from flask import Blueprint, request, jsonify
from config import SessionLocal, ADMIN_SECRET
from models import Station, QrAlias
from sqlalchemy.exc import IntegrityError

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
    name = (data.get("name") or "").strip().upper()
    lat  = data.get("lat")
    lng  = data.get("lng")

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
            s.commit()
            s.refresh(st)
            return jsonify(st.to_dict()), 201
    except IntegrityError:
        return jsonify({"error": f"Trạm '{name}' đã tồn tại"}), 409


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
