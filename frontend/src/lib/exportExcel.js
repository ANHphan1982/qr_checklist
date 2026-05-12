import * as XLSX from "xlsx";

const VN_TZ = "Asia/Ho_Chi_Minh";

const GEO_LABEL = {
  ok:           "Đúng trạm",
  out_of_range: "Ngoài phạm vi",
  no_gps:       "Không có GPS",
};

const ASSESSMENT_LABEL = {
  first:    "Trạm đầu",
  ok:       "Bình thường",
  too_fast: "Quá nhanh",
  too_slow: "Quá lâu",
  skipped:  "Bỏ qua (thiếu tọa độ)",
};

function roundOrEmpty(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return "";
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toVnDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const date = d.toLocaleDateString("vi-VN", { timeZone: VN_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} ${time}`;
}

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

export function buildStationsRows(stations) {
  return stations.map((st) => ({
    "Tên trạm":    st.name,
    "Latitude":    st.lat,
    "Longitude":   st.lng,
    "Bán kính (m)": st.radius,
    "Trạng thái":  st.active ? "Hoạt động" : "Vô hiệu",
  }));
}

export function buildAliasesRows(aliases) {
  return aliases.map((a) => ({
    "Nội dung QR": a.qr_content,
    "Tên trạm":    a.station_name,
    "Ghi chú":     a.note || "",
  }));
}

/**
 * @param {Array} logs - danh sách scan log
 * @param {Object} [paramConfigs] - map station_name → { param_low, param_high }
 *   Nếu truyền vào, mỗi row sẽ có thêm cột "Cảnh báo" khi value ngoài giới hạn.
 */
export function buildHistoryRows(logs, paramConfigs) {
  const hasConfigs = paramConfigs != null;
  return logs.map((log) => {
    const val = log.oil_level_mm ?? null;
    const row = {
      "ID":                              log.id,
      "Trạm":                            log.location,
      "Thời gian (VN)":                  toVnDateTime(log.scanned_at),
      "Device ID":                       log.device_id || "",
      "GPS":                             GEO_LABEL[log.geo_status] || log.geo_status || "",
      "Khoảng cách (m)":                 log.geo_distance != null ? log.geo_distance : "",
      "Khoảng cách từ trạm trước (m)":   roundOrEmpty(log.distance_from_prev_m, 0),
      "Thời gian dự kiến (phút)":        roundOrEmpty(log.expected_travel_min, 1),
      "Thời gian thực tế (phút)":        roundOrEmpty(log.actual_travel_min, 1),
      "Đánh giá tốc độ":                 log.assessment ? (ASSESSMENT_LABEL[log.assessment] || log.assessment) : "",
      "Thông số":                          val ?? "",
      "Email":                           log.email_sent ? "Đã gửi" : "Chưa gửi",
    };

    if (hasConfigs) {
      const cfg = paramConfigs[log.location];
      const outOfRange = cfg ? isOutOfRange(val, cfg.param_low, cfg.param_high) : false;
      row["Cảnh báo"] = outOfRange
        ? `⚠️ Ngoài giới hạn (L:${cfg.param_low ?? "-"} / H:${cfg.param_high ?? "-"})`
        : "";
    }

    return row;
  });
}

export function exportToExcel(rows, filename, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Xuất lịch sử với highlight đỏ cho giá trị ngoài giới hạn.
 * @param {Array} logs
 * @param {string} filename
 * @param {Object} paramConfigs - map station_name → { param_low, param_high }
 */
export function exportHistoryToExcel(logs, filename, paramConfigs = {}) {
  const rows = buildHistoryRows(logs, paramConfigs);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Áp dụng màu đỏ cho cell "Thông số" khi ngoài giới hạn
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    const paramColIdx = headers.indexOf("Thông số");

    if (paramColIdx >= 0) {
      logs.forEach((log, i) => {
        const cfg = paramConfigs[log.location];
        if (!cfg) return;
        const val = log.oil_level_mm ?? null;
        if (!isOutOfRange(val, cfg.param_low, cfg.param_high)) return;

        const cellAddr = XLSX.utils.encode_cell({ r: i + 1, c: paramColIdx });
        if (ws[cellAddr]) {
          ws[cellAddr].s = { font: { color: { rgb: "CC0000" }, bold: true } };
        }
      });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lịch sử");
  XLSX.writeFile(wb, filename, { cellStyles: true });
}
