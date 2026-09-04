"""
Import hàng loạt Trạm + QR Alias + Thông số từ file Excel template vào DB.

Cách dùng:
    cd backend
    python tools/import_config.py ../import-template/cau_hinh_template.xlsx
    python tools/import_config.py file.xlsx --dry-run   # chỉ xem trước, không ghi

Logic parse/upsert nằm ở services/import_service.py (dùng chung với
POST /api/admin/import-config trên trang Admin).
"""
import os
import sys

try:  # đảm bảo in tiếng Việt được trên console Windows (cp1252)
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SessionLocal  # noqa: E402
from services.import_service import import_workbook  # noqa: E402

LABELS = {"stations": "Trạm", "aliases": "QR Alias", "params": "Thông số"}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("Thiếu đường dẫn file. VD: python tools/import_config.py file.xlsx")
        sys.exit(1)
    path = args[0]
    if not os.path.exists(path):
        print(f"Không tìm thấy file: {path}")
        sys.exit(1)
    if SessionLocal is None:
        print("DATABASE_URL chưa cấu hình — không kết nối được DB.")
        sys.exit(1)

    wb = load_workbook(path, data_only=True)
    print(f"Đọc: {os.path.abspath(path)}{'  [DRY-RUN: không ghi DB]' if dry_run else ''}")

    with SessionLocal() as session:
        result = import_workbook(session, wb)
        for w in result["warnings"]:
            print(f"  [!] {w}")
        for key, label in LABELS.items():
            counts = result[key]
            if counts is None:
                print(f"  (không có sheet '{label}', bỏ qua)")
            else:
                print(f"{label + ':':<11}+{counts['created']} mới, "
                      f"~{counts['updated']} cập nhật, {counts['skipped']} bỏ qua")
        if dry_run:
            session.rollback()
            print("DRY-RUN: đã rollback, không thay đổi DB.")
        else:
            session.commit()
            print("[OK] Da commit vao DB.")


if __name__ == "__main__":
    main()
