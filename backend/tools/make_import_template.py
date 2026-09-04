"""
Sinh file Excel template để nhập hàng loạt: Trạm + QR Alias + Thông số.

Cách dùng:
    cd backend
    python tools/make_import_template.py
    # -> tạo ../import-template/cau_hinh_template.xlsx

Nội dung template được dựng ở services/import_service.py (dùng chung với
GET /api/admin/import-template — nút tải template trên trang Admin).
"""
import os
import sys

try:  # in tiếng Việt được trên console Windows (cp1252)
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.import_service import build_template_workbook  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "import-template")
OUT_PATH = os.path.join(OUT_DIR, "cau_hinh_template.xlsx")


def build():
    os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)
    build_template_workbook().save(os.path.abspath(OUT_PATH))
    print(f"[OK] Da tao template: {os.path.abspath(OUT_PATH)}")


if __name__ == "__main__":
    build()
