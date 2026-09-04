# Nhập hàng loạt cấu hình (Trạm / QR Alias / Thông số)

Thay cho việc gõ tay từng dòng trên trang Admin.

## Cách dễ nhất — qua trang Admin (không cần Python)

Trang **Admin → tab Import**: bấm **Tải template** → điền dữ liệu → chọn file →
**Xem trước** (dry-run, chưa ghi DB) → **Import thật**. Xong.

Cách dưới đây (CLI) vẫn dùng được, cùng logic import.

## Quy trình CLI

1. **Tạo / lấy template**

   ```bash
   cd backend
   python tools/make_import_template.py
   # -> import-template/cau_hinh_template.xlsx
   ```

2. **Điền dữ liệu** vào file `cau_hinh_template.xlsx` — 3 sheet: `Trạm`, `QR Alias`, `Thông số`.
   - Đọc sheet **Hướng dẫn** trong file để biết ý nghĩa từng cột.
   - Hàng tô xanh là ví dụ — xóa hoặc sửa đè.
   - **Không** đổi tên cột (hàng 1) và tên sheet.

3. **Import vào DB**

   ```bash
   cd backend
   python tools/import_config.py ../import-template/cau_hinh_template.xlsx --dry-run   # xem trước
   python tools/import_config.py ../import-template/cau_hinh_template.xlsx             # ghi thật
   ```

   Cần biến môi trường `DATABASE_URL` trỏ tới Supabase (đặt trong `backend/.env`).

## Upsert — import lại an toàn, không tạo bản sao

| Sheet     | Khóa nhận diện trùng                       |
|-----------|--------------------------------------------|
| Trạm      | `name`                                     |
| QR Alias  | `qr_content`                               |
| Thông số  | `station_name` + `tag` + `param_label`     |

- Import **không xóa** dữ liệu cũ. Để gỡ một thông số: đặt `active = FALSE` rồi import lại.
- Cột `checklist_types` của Trạm chỉ bị ghi đè khi ô **có giá trị** (tránh xóa nhầm gán cũ).

## Lưu ý

- Trạm mới nếu muốn hoạt động cả khi DB lỗi thì vẫn cần thêm vào `backend/services/stations_config.py` (static config).
- `--dry-run` đọc và đối chiếu DB nhưng **rollback**, không ghi gì — dùng để kiểm tra trước.
