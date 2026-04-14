from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from config import SessionLocal
from models import ScanLog
from sqlalchemy import and_

reports_bp = Blueprint("reports", __name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@reports_bp.route("/reports", methods=["GET"])
def get_reports():
    date_str = request.args.get("date")

    if date_str:
        try:
            local_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"status": "error", "message": "date phải có dạng YYYY-MM-DD"}), 400
    else:
        local_date = datetime.now(VN_TZ).date()

    # Chuyển ngày VN sang UTC để query
    start_local = datetime(local_date.year, local_date.month, local_date.day, tzinfo=VN_TZ)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    with SessionLocal() as session:
        logs = (
            session.query(ScanLog)
            .filter(and_(ScanLog.scanned_at >= start_utc, ScanLog.scanned_at < end_utc))
            .order_by(ScanLog.scanned_at.asc())
            .all()
        )
        result = [log.to_dict() for log in logs]

    return jsonify({
        "date": local_date.isoformat(),
        "total": len(result),
        "logs": result,
    })
