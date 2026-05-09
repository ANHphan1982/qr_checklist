from flask import Blueprint, request, jsonify
from services.scan_service import process_scan
from services.geo_service import validate_location
from services.stations_db import get_stations, get_qr_aliases, get_station_params
from services.qr_token_service import parse_qr_content, validate_token
from services.anti_fraud_service import check_gps_enforcement
from config import SessionLocal
from models import ScanLog
import os

scan_bp = Blueprint("scan", __name__)

# True = yêu cầu Rotating QR (cần màn hình tại trạm)
# False = chấp nhận QR tĩnh cũ (backward compatible)
REQUIRE_ROTATING_QR = os.getenv("REQUIRE_ROTATING_QR", "false").lower() == "true"


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
    """Danh sách trạm có cấu hình thông số vận hành (public, không cần auth)."""
    params = get_station_params()
    configs = [
        {"station_name": name, **data}
        for name, data in sorted(params.items())
        if data.get("active", True)
    ]
    return jsonify({"configs": configs}), 200


@scan_bp.route("/scan/<int:scan_id>/params", methods=["PATCH"])
def update_scan_params(scan_id):
    """Cập nhật thông số vận hành (Mức dầu mm) sau khi check-in."""
    data = request.get_json(silent=True) or {}
    oil_level_mm = data.get("oil_level_mm")

    with SessionLocal() as session:
        log = session.get(ScanLog, scan_id)
        if log is None:
            return jsonify({"status": "error", "message": "Không tìm thấy scan"}), 404
        log.oil_level_mm = oil_level_mm
        session.commit()

    return jsonify({"status": "ok"}), 200
