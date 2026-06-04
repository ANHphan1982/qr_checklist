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
  "PUMP_STATION_6": {
    station_name: "PUMP_STATION_6",
    params: [
      { tag: "052-PG-038",  param_label: "Discharge pressure",                param_unit: "kg/cm2g", param_low: 5,    param_high: 14 },
      { tag: "052-PG-890",  param_label: "Driven end seal pressure",          param_unit: "kg/cm2g", param_low: null, param_high: 0.5 },
      { tag: "052-LG-842",  param_label: "Driven end seal level",             param_unit: "%",       param_low: 70,   param_high: 90 },
      { tag: "P-5223A-C",   param_label: "Current (record current value)",    param_unit: "A",       param_low: null, param_high: null },
      { tag: "P-5223A-DT",  param_label: "Driven Bearing temperature",        param_unit: "°C",      param_low: null, param_high: 80 },
      { tag: "P-5223A-BDT", param_label: "Bearing temperature at driven end", param_unit: "°C",      param_low: null, param_high: 80 },
      { tag: "052-FIC-026", param_label: "Discharge flow",                    param_unit: "m³/h",    param_low: 96.2, param_high: 452.04 },
      { tag: "P-5223A-LOL", param_label: "Lube oil level",                    param_unit: "",        param_low: null, param_high: null },
    ],
  },
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

/**
 * Lọc ra các trạm builtin CHƯA có bản ghi trong DB (admin chưa "đưa vào DB để
 * quản lý"). Dùng ở trang Admin để hiển thị nút import — sau khi import, admin
 * mới bật/tắt được từng thông số builtin.
 *
 * @param {object|null} builtinConfigs - map {station_name: {station_name, params}}
 * @param {Array|null} dbParams - danh sách StationParam từ DB (mỗi phần tử có station_name)
 * @returns {Array<{station_name, params}>} các config builtin chưa nằm trong DB
 */
export function builtinStationsNotInDb(builtinConfigs, dbParams) {
  const dbStations = new Set((dbParams || []).map((p) => p.station_name));
  return Object.values(builtinConfigs || {}).filter(
    (cfg) => !dbStations.has(cfg.station_name)
  );
}
