"""
Admin API — quản lý stations và QR aliases.
Bảo vệ bằng header X-Admin-Key khớp với ADMIN_SECRET env var.
"""
import hmac
from flask import Blueprint, request, jsonify
from config import SessionLocal, ADMIN_SECRET
from models import Station, QrAlias, StationParam, ScanLog, resolve_checklist_list
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta

admin_bp = Blueprint("admin", __name__)


def _auth():
    """Trả về None nếu OK, Response lỗi nếu không hợp lệ."""
    if not ADMIN_SECRET:
        return jsonify({"error": "ADMIN_SECRET chưa cấu hình trên server"}), 500
    key = request.headers.get("X-Admin-Key", "")
    # encode để compare_digest không TypeError khi header chứa ký tự non-ASCII
    if not hmac.compare_digest(key.encode("utf-8"), ADMIN_SECRET.encode("utf-8")):
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


def _rename_station(s, st, new_name):
    """Đổi tên trạm + cascade. Trả về (json, status) khi lỗi, None khi OK.

    Config thông số, alias QR và lịch sử scan đều tham chiếu trạm bằng tên
    (không FK) → đổi đồng bộ trong cùng transaction với st.name.
    """
    if not new_name:
        return jsonify({"error": "Tên trạm không được rỗng"}), 400
    old_name = st.name
    if new_name == old_name:
        return None
    if s.query(Station).filter(Station.name == new_name).first():
        return jsonify({"error": f"Trạm '{new_name}' đã tồn tại"}), 409
    st.name = new_name
    s.query(StationParam).filter(StationParam.station_name == old_name)\
        .update({"station_name": new_name}, synchronize_session=False)
    s.query(QrAlias).filter(QrAlias.station_name == old_name)\
        .update({"station_name": new_name}, synchronize_session=False)
    s.query(ScanLog).filter(ScanLog.location == old_name)\
        .update({"location": new_name}, synchronize_session=False)
    # QR đã in tại trạm vẫn chứa tên cũ → giữ alias tên cũ → tên mới.
    alias = s.query(QrAlias).filter(QrAlias.qr_content == old_name).first()
    if alias:
        alias.station_name = new_name
    else:
        s.add(QrAlias(qr_content=old_name, station_name=new_name,
                      note=f"Đổi tên từ {old_name}"))
    return None


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
        if "name" in data:
            err = _rename_station(s, st, (data.get("name") or "").strip().upper())
            if err:
                return err
        if data.get("lat") is not None:
            st.lat = float(data["lat"])
        if data.get("lng") is not None:
            st.lng = float(data["lng"])
        if data.get("radius") is not None:
            st.radius = int(data["radius"])
        if data.get("active") is not None:
            st.active = bool(data["active"])
        # Gán checklist: ưu tiên checklist_types (list, đa giá trị). Giữ
        # checklist_type (single) đồng bộ = phần tử đầu cho client/route cũ.
        if "checklist_types" in data:
            raw = data.get("checklist_types") or []
            if not isinstance(raw, list):
                raw = [raw]
            cl = resolve_checklist_list(raw, None)
            st.checklist_types = cl
            st.checklist_type = cl[0] if cl else None
        elif "checklist_type" in data:
            # Backward compat: "" / None → gỡ gán; ngược lại chuẩn hoá chữ thường.
            ct = (data.get("checklist_type") or "").strip().lower()
            st.checklist_type = ct or None
            st.checklist_types = [ct] if ct else []
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


def _to_float_or_none(val):
    try:
        return float(val) if val not in (None, "") else None
    except (TypeError, ValueError):
        return None


@admin_bp.route("/admin/station-params", methods=["POST"])
def create_station_param():
    """Thêm MỘT thông số cho một trạm. Một trạm có thể có nhiều thông số."""
    err = _auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    station_name = (data.get("station_name") or "").strip().upper()
    tag          = (data.get("tag") or "").strip() or None
    param_label  = (data.get("param_label") or "Thông số").strip()
    param_unit   = (data.get("param_unit") or "mm").strip()
    param_low    = _to_float_or_none(data.get("param_low"))
    param_high   = _to_float_or_none(data.get("param_high"))
    try:
        sort_order = int(data.get("sort_order") or 0)
    except (TypeError, ValueError):
        sort_order = 0

    if not station_name:
        return jsonify({"error": "Thiếu station_name"}), 400

    if not SessionLocal:
        return _db_unavailable()

    with SessionLocal() as s:
        sp = StationParam(station_name=station_name, tag=tag, param_label=param_label,
                          param_unit=param_unit, param_low=param_low, param_high=param_high,
                          sort_order=sort_order)
        s.add(sp)
        s.commit()
        s.refresh(sp)
        return jsonify(sp.to_dict()), 201


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
        if "tag" in data:
            sp.tag = (data["tag"] or "").strip() or None
        if data.get("param_label") is not None:
            sp.param_label = data["param_label"].strip()
        if data.get("param_unit") is not None:
            sp.param_unit = data["param_unit"].strip()
        if "param_low" in data:
            sp.param_low = _to_float_or_none(data["param_low"])
        if "param_high" in data:
            sp.param_high = _to_float_or_none(data["param_high"])
        if "sort_order" in data:
            try:
                sp.sort_order = int(data["sort_order"] or 0)
            except (TypeError, ValueError):
                pass
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
