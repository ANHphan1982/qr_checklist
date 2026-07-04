// employeeName — nhớ tên nhân viên thực hiện checklist (localStorage) để in
// vào phần form báo cáo khi xuất Excel/email. Không login nên tên gắn theo
// thiết bị, người dùng tự sửa được trên HomePage.

const KEY = "qr_employee_name";

/** Lưu tên (đã trim). Chuỗi rỗng/toàn khoảng trắng = xóa tên; fail im lặng. */
export function saveEmployeeName(name) {
  try {
    const trimmed = (name || "").trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch (_) {
    /* private mode / quota — bỏ qua */
  }
}

/** Đọc tên đã lưu; "" nếu chưa có / lỗi. */
export function loadEmployeeName() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch (_) {
    return "";
  }
}
