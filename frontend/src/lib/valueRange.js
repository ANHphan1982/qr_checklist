/**
 * valueRange.js — kiểm tra giá trị thông số so với giới hạn low/high.
 *
 * Tách khỏi exportExcel.js để các module dùng ở flow chính (ScanHistory,
 * historyFilter) không kéo thư viện xlsx (~800KB) vào bundle khởi động.
 * exportExcel.js re-export lại để giữ backward compat.
 */

/**
 * Kiểm tra value có nằm ngoài [low, high] không.
 * Trả về true nếu ngoài giới hạn, false nếu OK hoặc không có giới hạn.
 */
export function isOutOfRange(value, low, high) {
  if (value == null) return false;
  if (low == null && high == null) return false;
  if (low != null && value < low) return true;
  if (high != null && value > high) return true;
  return false;
}
