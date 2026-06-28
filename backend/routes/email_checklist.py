"""
POST /api/email-checklist

Công khai (như /scan). Nhận file Excel checklist (base64) do frontend dựng và
gửi email kèm attachment cho quản lý (EMAIL_TO). Dùng cho nút "Gửi email" cạnh
nút Excel ở trang chọn checklist.

Body:
  - file_base64 (bắt buộc): nội dung file .xlsx mã hóa base64
  - filename    (bắt buộc): tên file đính kèm
  - subject     (tùy chọn): tiêu đề email
"""
from flask import Blueprint, request, jsonify
from services.email_service import send_checklist_excel_email

email_checklist_bp = Blueprint("email_checklist", __name__)

DEFAULT_SUBJECT = "[Checklist] Báo cáo checklist"


@email_checklist_bp.route("/email-checklist", methods=["POST"])
def email_checklist():
    body = request.get_json(silent=True) or {}
    filename = (body.get("filename") or "").strip()
    file_base64 = body.get("file_base64") or ""
    subject = (body.get("subject") or "").strip() or DEFAULT_SUBJECT

    if not filename or not file_base64:
        return jsonify({
            "status": "error",
            "message": "Thiếu filename hoặc file_base64",
        }), 400

    ok, message = send_checklist_excel_email(
        subject=subject,
        filename=filename,
        file_base64=file_base64,
    )
    if ok:
        return jsonify({"status": "ok", "message": "Đã gửi email"})
    return jsonify({"status": "error", "message": message}), 500
