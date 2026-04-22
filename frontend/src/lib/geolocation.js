export const GEO_ERRORS = {
  PERMISSION_DENIED: "Bạn cần cho phép truy cập vị trí để check-in.",
  POSITION_UNAVAILABLE: "Không lấy được vị trí. Vui lòng thử lại ngoài trời.",
  TIMEOUT: "Lấy vị trí quá lâu. Kiểm tra GPS đã bật chưa.",
  UNSUPPORTED: "Thiết bị không hỗ trợ GPS.",
};

/**
 * Kiểm tra trạng thái quyền GPS qua Permissions API trước khi xin thật.
 * Dùng để hiện hint cho user trước khi mở camera.
 *
 * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>}
 *   - 'granted'  → user đã cho phép trước đó, GPS sẽ lấy ngay
 *   - 'prompt'   → sẽ hiện hộp thoại xin quyền khi gọi getCurrentPosition
 *   - 'denied'   → user đã từ chối, check-in vẫn hoạt động nhưng không có GPS
 *   - 'unknown'  → trình duyệt không hỗ trợ Permissions API
 */
export async function checkGpsPermission() {
  if (!navigator.permissions) return "unknown";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state; // 'granted' | 'prompt' | 'denied'
  } catch {
    return "unknown";
  }
}

/**
 * Lấy vị trí GPS hiện tại.
 * @returns {Promise<{lat, lng, accuracy}>}
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error(GEO_ERRORS.UNSUPPORTED));
    }

    const isOffline = !navigator.onLine;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, // mét
        }),
      (err) => {
        const msg =
          {
            1: GEO_ERRORS.PERMISSION_DENIED,
            2: GEO_ERRORS.POSITION_UNAVAILABLE,
            3: GEO_ERRORS.TIMEOUT,
          }[err.code] || "Lỗi GPS không xác định.";
        reject(new Error(msg));
      },
      {
        // Offline = chế độ máy bay: WiFi/cell tắt, chỉ còn GPS vệ tinh hoạt động.
        // Phải bật high-accuracy để browser dùng chip GPS thay vì network positioning.
        enableHighAccuracy: true,
        // Offline: GPS cold-fix không có A-GPS cần 30–60s, đặt 30s để kịp lấy tín hiệu.
        // Online: 10s đủ vì có A-GPS hỗ trợ.
        timeout: isOffline ? 30000 : 10000,
        // Offline: ưu tiên cache cũ 5 phút để trả ngay nếu có, tránh phải chờ cold-fix.
        maximumAge: isOffline ? 300000 : 30000,
        ...options,
      }
    );
  });
}
