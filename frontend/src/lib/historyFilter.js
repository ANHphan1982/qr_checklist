// historyFilter — thống kê + lọc client-side cho trang Lịch sử. Thuần logic để
// test; UI (HistoryPage) chỉ render kết quả. Không gọi backend (lọc trên logs
// đã tải sẵn theo ngày).

import { isOutOfRange } from "./exportExcel";

/** Log có thông số vận hành nào vượt ngưỡng không. */
export function logHasBreach(log) {
  const pv = Array.isArray(log?.param_values) ? log.param_values : [];
  return pv.some((p) => isOutOfRange(p.value ?? null, p.low ?? null, p.high ?? null));
}

/** Đếm tổng + theo loại để hiển thị các stat pill. */
export function summarizeLogs(logs) {
  const list = Array.isArray(logs) ? logs : [];
  let ok = 0, outOfRange = 0, noGps = 0, breach = 0;
  for (const log of list) {
    if (log.geo_status === "ok") ok += 1;
    if (log.geo_status === "out_of_range") outOfRange += 1;
    if (log.geo_status === "no_gps") noGps += 1;
    if (logHasBreach(log)) breach += 1;
  }
  return { total: list.length, ok, outOfRange, noGps, breach };
}

/** Log có khớp category lọc không. */
function matchesCategory(log, category) {
  switch (category) {
    case "ok":           return log.geo_status === "ok";
    case "out_of_range": return log.geo_status === "out_of_range";
    case "no_gps":       return log.geo_status === "no_gps";
    case "breach":       return logHasBreach(log);
    case "all":
    default:             return true;
  }
}

/**
 * Lọc logs theo category + tìm theo tên trạm (substring, không phân biệt hoa thường).
 * @param {Array} logs
 * @param {{category?:string, query?:string}} opts
 */
export function filterLogs(logs, { category = "all", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return (Array.isArray(logs) ? logs : []).filter(
    (log) =>
      matchesCategory(log, category) &&
      (!q || String(log.location || "").toLowerCase().includes(q))
  );
}
