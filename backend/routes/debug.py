"""
Debug endpoint — kiểm tra email config, gửi test email, và chẩn đoán connectivity.
Chỉ dùng để chẩn đoán, không cần xác thực vì không lộ data nhạy cảm.
"""
from flask import Blueprint, request, jsonify
from config import RESEND_API_KEY, EMAIL_FROM, EMAIL_TO, CORS_ORIGIN
import resend
import os

debug_bp = Blueprint("debug", __name__)


@debug_bp.route("/debug/email-config", methods=["GET"])
def email_config():
    """Kiểm tra cấu hình email mà không gửi."""
    key = RESEND_API_KEY or ""
    return jsonify({
        "resend_api_key": f"{key[:8]}...{key[-4:]}" if len(key) > 12 else ("(trống)" if not key else "(quá ngắn)"),
        "email_from": EMAIL_FROM or "(trống)",
        "email_to": EMAIL_TO or "(trống)",
        "key_looks_valid": key.startswith("re_") and len(key) > 20,
    })


@debug_bp.route("/debug/email-test", methods=["POST"])
def email_test():
    """Gửi test email để xác nhận Resend hoạt động."""
    if not RESEND_API_KEY:
        return jsonify({"ok": False, "error": "RESEND_API_KEY chưa cấu hình"}), 500

    to_list = [e.strip() for e in EMAIL_TO.split(",") if e.strip()] if EMAIL_TO else []
    params = {
        "from": EMAIL_FROM,
        "to": to_list,
        "subject": "[QR Checklist] Test email — cấu hình OK",
        "html": "<p>Email test thành công! Hệ thống QR Checklist đã cấu hình email đúng.</p>",
    }
    try:
        if hasattr(resend, "Resend"):
            client = resend.Resend(api_key=RESEND_API_KEY)
            resp = client.emails.send(params)
        else:
            resend.api_key = RESEND_API_KEY
            resp = resend.Emails.send(params)
        return jsonify({"ok": True, "resend_id": getattr(resp, "id", str(resp))})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"{type(exc).__name__}: {exc}"}), 500


@debug_bp.route("/debug/connectivity", methods=["GET", "OPTIONS"])
def connectivity():
    """
    Chẩn đoán kết nối từ mobile — trả về Origin, CORS config, env check.
    Gọi từ: GET /api/debug/connectivity
    """
    origin = request.headers.get("Origin", "(không có Origin header)")
    return jsonify({
        "ok": True,
        "request_origin": origin,
        "cors_origin_env": CORS_ORIGIN or "(chưa set)",
        "database_url_set": bool(os.getenv("DATABASE_URL")),
        "resend_key_set": bool(RESEND_API_KEY),
        "flask_env": os.getenv("FLASK_ENV", "development"),
        "note": "Nếu thấy response này tức là CORS đã pass và server đang chạy",
    })
