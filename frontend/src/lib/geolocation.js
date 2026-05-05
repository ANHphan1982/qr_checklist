export const GEO_ERRORS = {
  PERMISSION_DENIED: "Bạn cần cho phép truy cập vị trí để check-in.",
  POSITION_UNAVAILABLE: "Không lấy được vị trí. Vui lòng thử lại ngoài trời.",
  TIMEOUT: "Lấy vị trí quá lâu. Kiểm tra GPS đã bật chưa.",
  UNSUPPORTED: "Thiết bị không hỗ trợ GPS.",
  LOW_ACCURACY:
    "GPS không đủ chính xác. Hãy ra ngoài trời hoặc gần cửa sổ để bắt tín hiệu vệ tinh tốt hơn.",
};

// Geolocation options theo trạng thái mạng.
// Offline (airplane/mất mạng): chỉ còn GPS vệ tinh, không có A-GPS — cold-fix lâu.
// Online: có network positioning + A-GPS hỗ trợ.
const GEO_OPTIONS = {
  offline: { timeout: 90000, maximumAge: 10000 },
  online:  { timeout: 10000, maximumAge: 30000 },
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
 * Phân loại chất lượng GPS dựa trên accuracy (mét).
 * Hữu ích để phát hiện "Location accuracy = OFF" (Android) hoặc thiếu A-GPS.
 *
 * @param {number} accuracyMeters
 * @returns {'good'|'acceptable'|'poor'}
 */
export function classifyAccuracy(accuracyMeters) {
  if (accuracyMeters <= 20) return "good";
  if (accuracyMeters <= 100) return "acceptable";
  return "poor";
}

/**
 * Lấy vị trí GPS hiện tại.
 *
 * @param {object} [options]
 * @param {number} [options.accuracyThreshold] - Reject nếu accuracy (mét) vượt ngưỡng này.
 *   Dùng khi cần phát hiện "Location accuracy = OFF" hoặc GPS quá kém.
 * @returns {Promise<{lat, lng, accuracy}>}
 */
export function getCurrentPosition(options = {}) {
  const { accuracyThreshold, ...geoOptions } = options;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error(GEO_ERRORS.UNSUPPORTED));
    }

    const preset = navigator.onLine ? GEO_OPTIONS.online : GEO_OPTIONS.offline;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const result = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (accuracyThreshold != null && result.accuracy > accuracyThreshold) {
          return reject(new Error(GEO_ERRORS.LOW_ACCURACY));
        }
        resolve(result);
      },
      (err) => {
        const msg =
          {
            1: GEO_ERRORS.PERMISSION_DENIED,
            2: GEO_ERRORS.POSITION_UNAVAILABLE,
            3: GEO_ERRORS.TIMEOUT,
          }[err.code] || "Lỗi GPS không xác định.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, ...preset, ...geoOptions }
    );
  });
}

/**
 * Bắt đầu watchPosition để giữ chip GPS chạy liên tục.
 *
 * Lý do dùng watch thay vì gọi getCurrentPosition mỗi lần scan:
 *  - Cold-fix GPS không có A-GPS mất 30–90s. Watch giữ chip GPS warm sau lần fix
 *    đầu, mỗi lần scan tiếp theo có vị trí gần như tức thời.
 *  - WiFi nội bộ không có internet → A-GPS/WiFi positioning chết, chỉ chip GPS
 *    còn hoạt động → cold-fix lại mỗi lần là không khả thi.
 *
 * Caller phải tự gọi stop() khi unmount để tránh leak.
 *
 * @param {object} cbs
 * @param {(pos: {lat:number,lng:number,accuracy:number,ts:number}) => void} cbs.onUpdate
 * @param {(err: Error) => void} [cbs.onError]
 * @param {object} [options] override watch options
 * @returns {() => void} stop function
 */
export function startGpsWatch({ onUpdate, onError } = {}, options = {}) {
  if (!navigator.geolocation) {
    onError?.(new Error(GEO_ERRORS.UNSUPPORTED));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate?.({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        ts: pos.timestamp || Date.now(),
      });
    },
    (err) => {
      const msg =
        {
          1: GEO_ERRORS.PERMISSION_DENIED,
          2: GEO_ERRORS.POSITION_UNAVAILABLE,
          3: GEO_ERRORS.TIMEOUT,
        }[err.code] || "Lỗi GPS không xác định.";
      onError?.(new Error(msg));
    },
    {
      enableHighAccuracy: true,
      timeout: 90000,
      maximumAge: 0,
      ...options,
    }
  );

  return () => {
    try {
      navigator.geolocation.clearWatch(watchId);
    } catch {
      // ignore
    }
  };
}
