from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import and_

from config import SessionLocal
from models import ScanLog
from services.dashboard_service import build_dashboard

dashboard_bp = Blueprint("dashboard", __name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

DEFAULT_DAYS = 7
MAX_DAYS = 90  # giới hạn cửa sổ — free tier purge 30 ngày, 90 đủ rộng & an toàn


@dashboard_bp.route("/dashboard", methods=["GET"])
def get_dashboard():
    """Analytics tổng hợp cho N ngày gần nhất (heatmap, geo, trạm, xu hướng thông số)."""
    if SessionLocal is None:
        return jsonify({"status": "error", "message": "Database chưa được cấu hình"}), 503

    raw_days = request.args.get("days")
    if raw_days is None:
        days = DEFAULT_DAYS
    else:
        try:
            days = int(raw_days)
        except (ValueError, TypeError):
            return jsonify({"status": "error", "message": "days phải là số nguyên"}), 400
        if days <= 0:
            return jsonify({"status": "error", "message": "days phải > 0"}), 400
        days = min(days, MAX_DAYS)

    now_utc = datetime.now(timezone.utc)
    start_utc = now_utc - timedelta(days=days)

    try:
        with SessionLocal() as session:
            logs = (
                session.query(ScanLog)
                .filter(and_(ScanLog.scanned_at >= start_utc, ScanLog.scanned_at <= now_utc))
                .order_by(ScanLog.scanned_at.asc())
                .all()
            )
            log_dicts = [log.to_dict() for log in logs]

        payload = build_dashboard(log_dicts)
        payload["days"] = days
        payload["from"] = start_utc.isoformat()
        payload["to"] = now_utc.isoformat()
        return jsonify(payload), 200
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
