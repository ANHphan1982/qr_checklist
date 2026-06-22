from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from services.scan_service import process_scan, maybe_alert_thresholds
from services.geo_service import validate_location
from services.stations_db import get_stations, get_qr_aliases, get_station_params, get_checklist_assignments
from services.qr_token_service import parse_qr_content, validate_token
from services.anti_fraud_service import check_gps_enforcement
from config import SessionLocal
from models import ScanLog
import os

scan_bp = Blueprint("scan", __name__)

# True = yêu cầu Rotating QR (cần màn hình tại trạm)
# False = chấp nhận QR tĩnh cũ (backward compatible)
REQUIRE_ROTATING_QR = os.getenv("REQUIRE_ROTATING_QR", "false").lower() == "true"

# PATCH /scan/<id>/params là endpoint public (flow nhập thông số ngay sau check-in,
# không có login) → giới hạn cửa sổ sửa để người ngoài không sửa được scan cũ
# bằng cách đoán id. 60 phút đủ rộng cho user nhập chậm/khóa màn hình giữa chừng.
PARAMS_EDIT_WINDOW_MINUTES = int(os.getenv("PARAMS_EDIT_WINDOW_MINUTES", "60"))

# Giới hạn kích thước param_values — chống nhét JSON rác/khổng lồ vào DB.
MAX_PARAM_ITEMS = 50
MAX_PARAM_STR_LEN = 100


@scan_bp.route("/scan", methods=["POST"])
def create_scan():
    data = request.get_json(silent=True) or {}

    raw_qr = (data.get("location") or "").strip()
    if not raw_qr:
        return jsonify({"status": "error", "message": "Thiếu trường location"}), 400

    # --- Parse QR content (hỗ trợ cả format cũ và mới) ---
    location, token = parse_qr_content(raw_qr)

    if not location:
        return jsonify({"status": "error", "message": "Mã QR không hợp lệ"}), 400

    # --- Validate Rotating QR token ---
    token_valid = validate_token(location, token) if token else False

    if REQUIRE_ROTATING_QR and not token_valid:
        return jsonify({
            "status": "error",
            "code": "INVALID_TOKEN",
            "message": "Mã QR đã hết hạn hoặc không hợp lệ. Vui lòng quét mã QR mới nhất trên màn hình trạm.",
        }), 403

    device_id    = data.get("device_id")
    scanned_at   = data.get("scanned_at")
    scan_lat     = data.get("lat")
    scan_lng     = data.get("lng")
    accuracy     = data.get("accuracy")
    geo_cached   = bool(data.get("geo_cached"))
    cache_age_ms = data.get("cache_age_ms")
    oil_level_mm = data.get("oil_level_mm")
    param_values = data.get("param_values")  # danh sách thông số vận hành (multi-param)

    # --- GPS Enforcement ---
    gps_err = check_gps_enforcement(scan_lat, scan_lng, accuracy)
    if gps_err:
        return jsonify(gps_err), 403

    # --- GPS Geofencing ---
    # geo_status:
    #   ok           = GPS thật, đúng phạm vi trạm
    #   out_of_range = GPS thật, ngoài phạm vi (cảnh báo gian lận)
    #   cached       = vị trí từ localStorage (chip GPS fail tại điểm scan, dùng fix cũ)
    #   unverified   = GPS thiết bị có, nhưng trạm chưa được config tọa độ → không xác nhận được phạm vi
    #   no_gps       = thiết bị không gửi GPS gì cả
    geo_result = {"valid": True, "distance": None, "skipped": True}
    geo_status = "no_gps"

    if scan_lat is not None and scan_lng is not None:
        geo_result = validate_location(location, float(scan_lat), float(scan_lng), get_stations())
        if geo_cached:
            # Cache fix: không dùng để xác thực gian lận vì vị trí có thể đã cũ.
            # Vẫn lưu lat/lng và distance để admin tham khảo, nhưng không reject OUT_OF_RANGE.
            geo_status = "cached"
        elif not geo_result["valid"]:
            geo_status = "out_of_range"
        elif geo_result.get("skipped"):
            # Trạm chưa được config tọa độ — GPS có nhưng không thể xác nhận phạm vi.
            # "unverified" phân biệt với "no_gps" (thiết bị không gửi GPS).
            geo_status = "unverified"
        else:
            geo_status = "ok"

    # --- Process (bao gồm rate limiting bên trong) ---
    try:
        result = process_scan(
            location=location,
            device_id=device_id,
            scanned_at=scanned_at,
            lat=scan_lat,
            lng=scan_lng,
            accuracy=accuracy,
            geo_distance=geo_result.get("distance"),
            geo_status=geo_status,
            token_valid=token_valid,
            cache_age_ms=cache_age_ms if geo_cached else None,
            oil_level_mm=oil_level_mm,
            param_values=param_values,
        )
        # OUT_OF_RANGE: đã lưu DB nhưng trả 403 để frontend hiện cảnh báo
        if geo_status == "out_of_range":
            return jsonify({
                "status": "error",
                "code": "OUT_OF_RANGE",
                "message": geo_result["message"],
                "distance": geo_result["distance"],
                "scan_id": result.get("scan_id"),
                "location": location,
            }), 403
        result["location"] = location
        status_code = 200 if result["status"] == "ok" else 400
        return jsonify(result), status_code
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@scan_bp.route("/station-params", methods=["GET"])
def station_params_endpoint():
    """Danh sách trạm có cấu hình thông số vận hành (public, không cần auth).

    Mỗi trạm trả về kèm danh sách `params` (multi-param):
      { "configs": [ { "station_name": "...", "params": [ {...}, ... ] }, ... ] }
    """
    params = get_station_params()
    # Emit MỌI trạm, kể cả trạm đã bị admin ẩn (params rỗng). Frontend cần entry
    # rỗng này để override builtin offline — nếu bỏ qua, builtin sẽ tái hiện thông
    # số đã ẩn trên thiết bị không có mạng.
    configs = [
        {"station_name": name, "params": data.get("params", [])}
        for name, data in sorted(params.items())
    ]
    return jsonify({"configs": configs}), 200


@scan_bp.route("/checklist-stations", methods=["GET"])
def checklist_stations_endpoint():
    """Mapping checklist → trạm (public, không auth).

    Trả {"assignments": {checklist_type: [station_name, ...]}}. Mọi thiết bị đọc
    chung từ DB → cảnh báo "kiểm tra đủ 1 lần/ca" giống nhau trên mọi điện thoại.
    """
    return jsonify({"assignments": get_checklist_assignments()}), 200


def _first_numeric_value(param_values):
    """Lấy giá trị số đầu tiên trong param_values để giữ oil_level_mm (backward compat)."""
    if not param_values:
        return None
    for pv in param_values:
        v = pv.get("value") if isinstance(pv, dict) else None
        if isinstance(v, (int, float)):
            return float(v)
    return None


def _is_number(v):
    """Số thực sự — loại trừ bool (bool là subclass của int trong Python)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _validate_param_values(param_values):
    """Kiểm tra cấu trúc param_values từ client. Trả về message lỗi hoặc None nếu OK.

    Shape hợp lệ: list các dict {tag, label, unit, value, low, high} — value/low/high
    là số hoặc None, các trường chữ ≤ MAX_PARAM_STR_LEN ký tự.
    """
    if not isinstance(param_values, list):
        return "param_values phải là danh sách"
    if len(param_values) > MAX_PARAM_ITEMS:
        return f"param_values tối đa {MAX_PARAM_ITEMS} thông số"
    for pv in param_values:
        if not isinstance(pv, dict):
            return "mỗi thông số phải là object"
        for key in ("value", "low", "high"):
            v = pv.get(key)
            if v is not None and not _is_number(v):
                return f"'{key}' phải là số hoặc null"
        for key in ("tag", "label", "unit"):
            s = pv.get(key)
            if s is not None and (not isinstance(s, str) or len(s) > MAX_PARAM_STR_LEN):
                return f"'{key}' phải là chuỗi ≤ {MAX_PARAM_STR_LEN} ký tự"
    return None


@scan_bp.route("/scan/<int:scan_id>/params", methods=["PATCH"])
def update_scan_params(scan_id):
    """Cập nhật thông số vận hành sau khi check-in.

    Nhận `param_values` (danh sách multi-param). Vẫn chấp nhận `oil_level_mm`
    đơn lẻ từ client cũ để tương thích ngược.

    Endpoint public (modal nhập thông số ngay sau scan, app không có login) nên
    được siết: validate cấu trúc dữ liệu + chỉ cho sửa scan vừa tạo trong
    PARAMS_EDIT_WINDOW_MINUTES — chặn người ngoài đoán scan_id để sửa dữ liệu cũ.
    """
    if SessionLocal is None:
        return jsonify({"status": "error", "message": "Database chưa được cấu hình"}), 503

    data = request.get_json(silent=True) or {}
    param_values = data.get("param_values")
    oil_level_mm = data.get("oil_level_mm")

    if param_values is None and oil_level_mm is None:
        return jsonify({"status": "error", "message": "Thiếu param_values hoặc oil_level_mm"}), 400
    if param_values is not None:
        err = _validate_param_values(param_values)
        if err:
            return jsonify({"status": "error", "message": err}), 400
    if oil_level_mm is not None and not _is_number(oil_level_mm):
        return jsonify({"status": "error", "message": "oil_level_mm phải là số"}), 400

    with SessionLocal() as session:
        log = session.get(ScanLog, scan_id)
        if log is None:
            return jsonify({"status": "error", "message": "Không tìm thấy scan"}), 404

        # Cửa sổ sửa: tính từ created_at (thời điểm bản ghi vào DB) chứ không phải
        # scanned_at — scan offline sync muộn vẫn sửa được ngay sau khi đồng bộ.
        created = log.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=PARAMS_EDIT_WINDOW_MINUTES)
            if created < cutoff:
                return jsonify({
                    "status": "error",
                    "message": f"Scan quá {PARAMS_EDIT_WINDOW_MINUTES} phút — không thể sửa thông số",
                }), 403

        if param_values is not None:
            log.param_values = param_values or None
            if oil_level_mm is None:
                oil_level_mm = _first_numeric_value(param_values)
        log.oil_level_mm = oil_level_mm
        session.commit()

        # Đọc bối cảnh cảnh báo khi log còn gắn session (sau commit object detach)
        alert_ctx = (log.location, log.scanned_at, log.device_id)

    # Cảnh báo vượt ngưỡng SAU commit — không giữ transaction khi gọi Resend.
    breaches = maybe_alert_thresholds(*alert_ctx, param_values) if param_values is not None else []

    return jsonify({"status": "ok", "threshold_breaches": len(breaches)}), 200
