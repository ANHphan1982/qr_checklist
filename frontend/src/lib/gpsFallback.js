// gpsFallback — chuẩn bị dữ liệu vị trí khi chip GPS không fix được tại chỗ,
// và định nghĩa mốc thời gian cho đường thoát thủ công.
//
// Bối cảnh: trong hầm bồn / nhà xưởng không có A-GPS, getCurrentPosition có thể
// treo tới 90s (xem GEO_OPTIONS.offline trong geolocation.js). QR đã quét xong,
// nút hành động ở trạng thái loading → nhân viên kẹt cứng, không hủy được cũng
// không gửi được. Sau GPS_SLOW_HINT_MS, ScanPage hiện nút "Gửi không kèm GPS".

/** Sau bao lâu chờ fix thì hiện đường thoát cho user (ms). */
export const GPS_SLOW_HINT_MS = 8000;

/** Sentinel để phân biệt "user bỏ qua" với "fix thật" trong Promise.race. */
export const GPS_SKIPPED = Symbol("gps-skipped");

/**
 * Dựng payload GPS từ fix cache localStorage.
 * `cached: true` để server đánh dấu geo_status='cached' — admin biết đây là vị
 * trí lấy trước đó, không phải GPS đo tại trạm, nên không dùng để kết tội.
 *
 * @param {{lat:number,lng:number,accuracy?:number,ts:number}|null} cached
 * @param {number} [nowMs]
 * @returns {{lat,lng,accuracy,cached,cache_age_ms}|null} null nếu cache không dùng được
 */
export function buildCachedGpsData(cached, nowMs = Date.now()) {
  if (!cached) return null;
  if (typeof cached.lat !== "number" || typeof cached.lng !== "number") return null;
  return {
    lat: cached.lat,
    lng: cached.lng,
    accuracy: cached.accuracy,
    cached: true,
    cache_age_ms: typeof cached.ts === "number" ? nowMs - cached.ts : undefined,
  };
}

/**
 * Tạo cặp {promise, skip} để user chủ động thoát khỏi vòng chờ GPS.
 * promise chỉ resolve khi skip() được gọi → dùng trong Promise.race với
 * getCurrentPosition(), không bao giờ tự reject nên không cần catch riêng.
 *
 * @returns {{promise: Promise<symbol>, skip: () => void}}
 */
export function createGpsSkipHandle() {
  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  return { promise, skip: () => resolveFn(GPS_SKIPPED) };
}
