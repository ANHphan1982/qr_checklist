"""
GET /api/reports/trigger-summary?period=morning|evening
Auth: X-Admin-Key header hoặc ?key=<secret> (để tương thích cron-job.org)
"""
import hmac
from flask import Blueprint, request, jsonify
from config import ADMIN_SECRET
from services.summary_service import send_summary_report

summary_bp = Blueprint("summary", __name__)


def _auth():
    if not ADMIN_SECRET:
        return jsonify({"error": "ADMIN_SECRET chưa cấu hình"}), 500
    key = request.headers.get("X-Admin-Key", "") or request.args.get("key", "")
    # encode để compare_digest không TypeError khi key chứa ký tự non-ASCII
    if not hmac.compare_digest(key.encode("utf-8"), ADMIN_SECRET.encode("utf-8")):
        return jsonify({"error": "Unauthorized"}), 401
    return None


@summary_bp.route("/reports/trigger-summary", methods=["GET"])
def trigger_summary():
    err = _auth()
    if err:
        return err

    period = request.args.get("period", "morning").lower()
    if period not in ("morning", "evening", "other"):
        return jsonify({"error": "period phải là morning hoặc evening"}), 400

    ok, message = send_summary_report(period)
    if ok:
        return jsonify({"status": "ok", "message": message})
    return jsonify({"status": "error", "message": message}), 500
