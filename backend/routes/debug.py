"""
Debug endpoint — kiểm tra email config và gửi test email.
Chỉ dùng để chẩn đoán, không cần xác thực vì không lộ data nhạy cảm.
"""
from flask import Blueprint, request, jsonify
from config import RESEND_API_KEY, EMAIL_FROM, EMAIL_TO
import resend

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

    client = resend.Resend(api_key=RESEND_API_KEY)
    to_list = [e.strip() for e in EMAIL_TO.split(",") if e.strip()] if EMAIL_TO else []
    try:
        resp = client.emails.send({
            "from": EMAIL_FROM,
            "to": to_list,
            "subject": "[QR Checklist] Test email — cấu hình OK",
            "html": "<p>Email test thành công! Hệ thống QR Checklist đã cấu hình email đúng.</p>",
        })
        return jsonify({"ok": True, "resend_id": getattr(resp, "id", str(resp))})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"{type(exc).__name__}: {exc}"}), 500
