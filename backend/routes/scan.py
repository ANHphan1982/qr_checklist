from flask import Blueprint, request, jsonify
from services.scan_service import process_scan
from services.geo_service import validate_location
from services.stations_config import STATIONS

scan_bp = Blueprint("scan", __name__)


@scan_bp.route("/scan", methods=["POST"])
def create_scan():
    data = request.get_json(silent=True) or {}

    location = (data.get("location") or "").strip()
    if not location:
        return jsonify({"status": "error", "message": "Thiếu trường location"}), 400

    device_id  = data.get("device_id")
    scanned_at = data.get("scanned_at")
    scan_lat   = data.get("lat")
    scan_lng   = data.get("lng")
    accuracy   = data.get("accuracy")

    # --- GPS Validation ---
    geo_result = {"valid": True, "distance": None, "skipped": True}
    geo_status = "no_gps"

    if scan_lat is not None and scan_lng is not None:
        geo_result = validate_location(location, float(scan_lat), float(scan_lng), STATIONS)
        if not geo_result["valid"]:
            return jsonify({
                "status": "error",
                "code": "OUT_OF_RANGE",
                "message": geo_result["message"],
                "distance": geo_result["distance"],
            }), 403
        geo_status = "ok"

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
        )
        status_code = 200 if result["status"] == "ok" else 400
        return jsonify(result), status_code
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
