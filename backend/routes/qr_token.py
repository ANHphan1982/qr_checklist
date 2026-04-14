from flask import Blueprint, jsonify
from services.qr_token_service import current_qr_content

qr_token_bp = Blueprint("qr_token", __name__)


@qr_token_bp.route("/qr-token/<path:station_name>", methods=["GET"])
def get_qr_token(station_name: str):
    """
    Trả về nội dung QR hiện tại cho màn hình trạm.
    Display page dùng endpoint này để refresh token tự động.
    """
    data = current_qr_content(station_name)
    return jsonify(data)
