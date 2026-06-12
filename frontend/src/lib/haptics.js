/**
 * haptics — rung phản hồi khi scan xong.
 * Công nhân ngoài trời nắng khó nhìn màn hình → rung là kênh phản hồi quan trọng.
 *
 * Convention:
 *   ok      → 2 nhịp ngắn  (thành công, dễ phân biệt)
 *   offline → 1 nhịp ngắn  (đã lưu, chưa xác nhận server)
 *   error   → 1 nhịp dài   (lỗi, cần nhìn màn hình)
 *
 * iOS Safari không hỗ trợ navigator.vibrate → triggerVibration fail im lặng.
 */

const PATTERNS = {
  ok:      [60, 50, 60],
  offline: [80],
  error:   [250],
};

export function vibrationPatternFor(status) {
  return PATTERNS[status] ?? null;
}

export function triggerVibration(status, nav = typeof navigator !== "undefined" ? navigator : null) {
  const pattern = vibrationPatternFor(status);
  if (!pattern) return false;
  if (!nav || typeof nav.vibrate !== "function") return false;
  try {
    return nav.vibrate(pattern) === true;
  } catch {
    return false;
  }
}
