// recentChecklist — nhớ checklist vừa mở gần nhất (localStorage) để thẻ
// "Tiếp tục" ở HomePage phản ánh đúng thói quen người dùng, thay cho id tĩnh.

const KEY = "qr_recent_checklist";

/** Lưu id checklist vừa mở. Bỏ qua id rỗng; fail im lặng nếu localStorage lỗi. */
export function saveRecentChecklist(id) {
  if (!id) return;
  try {
    localStorage.setItem(KEY, String(id));
  } catch (_) {
    /* private mode / quota — bỏ qua */
  }
}

/** Đọc id checklist gần nhất; null nếu chưa có / lỗi. */
export function loadRecentChecklist() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch (_) {
    return null;
  }
}
