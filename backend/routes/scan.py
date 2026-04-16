from flask import Blueprint, request, jsonify
from services.scan_service import process_scan
from services.geo_service import validate_location
from services.stations_config import STATIONS
from services.qr_token_service import parse_qr_content, validate_token
from services.anti_fraud_service import check_gps_enforcement
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

    device_id  = data.get("device_id")
    scanned_at = data.get("scanned_at")
    scan_lat   = data.get("lat")
    scan_lng   = data.get("lng")
    accuracy   = data.get("accuracy")

    # --- GPS Enforcement ---
    gps_err = check_gps_enforcement(scan_lat, scan_lng, accuracy)
    if gps_err:
        return jsonify(gps_err), 403

    # --- GPS Geofencing ---
    geo_result = {"valid": True, "distance": None, "skipped": True}
    geo_status = "no_gps"

    if scan_lat is not None and scan_lng is not None:
        geo_result = validate_location(location, float(scan_lat), float(scan_lng), STATIONS)
        if not geo_result["valid"]:
            geo_status = "out_of_range"
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
        )
        # OUT_OF_RANGE: đã lưu DB nhưng trả 403 để frontend hiện cảnh báo
        if geo_status == "out_of_range":
            return jsonify({
                "status": "error",
                "code": "OUT_OF_RANGE",
                "message": geo_result["message"],
                "distance": geo_result["distance"],
                "scan_id": result.get("scan_id"),
            }), 403
        status_code = 200 if result["status"] == "ok" else 400
        return jsonify(result), status_code
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
