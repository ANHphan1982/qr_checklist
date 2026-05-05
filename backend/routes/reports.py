from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from config import SessionLocal
from models import ScanLog
from services.stations_db import get_stations
from services.route_assessment import compute_route_assessment
from sqlalchemy import and_

reports_bp = Blueprint("reports", __name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@reports_bp.route("/reports", methods=["GET"])
def get_reports():
    if SessionLocal is None:
        return jsonify({"status": "error", "message": "Database chưa được cấu hình"}), 503

    date_str = request.args.get("date")

    if date_str:
        try:
            local_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"status": "error", "message": "date phải có dạng YYYY-MM-DD"}), 400
    else:
        local_date = datetime.now(VN_TZ).date()

    start_local = datetime(local_date.year, local_date.month, local_date.day, tzinfo=VN_TZ)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    try:
        with SessionLocal() as session:
            logs = (
                session.query(ScanLog)
                .filter(and_(ScanLog.scanned_at >= start_utc, ScanLog.scanned_at < end_utc))
                .order_by(ScanLog.scanned_at.asc())
                .all()
            )
            result = [log.to_dict() for log in logs]

        # Enrich với route assessment — group theo device_id để mỗi nhân viên
        # được đánh giá độc lập, tránh tính khoảng cách giữa scan của 2 người khác nhau.
        stations = get_stations()
        by_device: dict = {}
        for scan in result:
            by_device.setdefault(scan.get("device_id"), []).append(scan)
        enriched_by_id: dict = {}
        for group in by_device.values():
            for s in compute_route_assessment(group, stations):
                enriched_by_id[s["id"]] = s
        # Giữ thứ tự ban đầu của result
        enriched = [enriched_by_id.get(s["id"], s) for s in result]

        return jsonify({
            "date": local_date.isoformat(),
            "total": len(enriched),
            "logs": enriched,
        })
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
