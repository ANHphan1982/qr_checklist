/**
 * Cấu hình thông số vận hành tích hợp sẵn trong app bundle.
 *
 * Mục đích: thiết bị không có mạng (hoặc vừa tắt airplane mode) vẫn hiển thị
 * modal nhập thông số mà không cần fetch API trước.
 *
 * Quy tắc ưu tiên: API/localStorage > builtin (xem mergeWithBuiltin).
 * Khi admin cập nhật qua trang Admin, thiết bị có mạng sẽ tự override builtin.
 */
export const BUILTIN_PARAM_CONFIGS = {
  "PUMP_STATION_7": {
    station_name: "PUMP_STATION_7",
    params: [
      { tag: "P-5225A", param_label: "P-5225A_Discharge_Pressure", param_unit: "kg/cm2g", param_low: null, param_high: null },
    ],
  },
  "TK-5203A": {
    station_name: "TK-5203A",
    params: [
      { tag: null, param_label: "Tank level", param_unit: "mm", param_low: null, param_high: null },
    ],
  },
  "TK-5205A": {
    station_name: "TK-5205A",
    params: [
      { tag: null, param_label: "Tank level", param_unit: "mm", param_low: null, param_high: null },
    ],
  },
  "TK-5211A": {
    station_name: "TK-5211A",
    params: [
      { tag: null, param_label: "Tank level", param_unit: "mm", param_low: null, param_high: null },
    ],
  },
};

/**
 * Merge builtin configs với cache từ localStorage hoặc API fetch.
 * Cache/API thắng khi trùng key — builtin chỉ là fallback.
 *
 * @param {object|null} cached - object từ localStorage hoặc API response
 * @returns {object} merged configs
 */
export function mergeWithBuiltin(cached) {
  return { ...BUILTIN_PARAM_CONFIGS, ...(cached || {}) };
}
