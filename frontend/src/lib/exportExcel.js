import * as XLSX from "xlsx";

const VN_TZ = "Asia/Ho_Chi_Minh";

const GEO_LABEL = {
  ok:           "Đúng trạm",
  out_of_range: "Ngoài phạm vi",
  unverified:   "Chưa xác thực vị trí",
  cached:       "Vị trí lưu tạm",
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
 * Trích các thông số vận hành của một log để xuất Excel (long format).
 * Mỗi phần tử trả về tương ứng 1 dòng Excel.
 *
 * Ưu tiên `param_values` (multi-param, tự mô tả). Nếu log cũ chỉ có
 * `oil_level_mm` thì dựng 1 thông số từ paramConfigs[location]. Nếu không có
 * thông số nào, vẫn trả 1 dòng rỗng để lượt check-in hiện diện trong báo cáo.
 *
 * @returns {Array<{tag, label, value, unit, low, high}>}
 */
function buildParamEntries(log, paramConfigs) {
  const pv = Array.isArray(log.param_values) ? log.param_values : [];
  if (pv.length > 0) {
    return pv.map((p) => ({
      tag:   p.tag   ?? "",
      label: p.label ?? "",
      value: p.value ?? null,
      unit:  p.unit  ?? "",
      low:   p.low   ?? null,
      high:  p.high  ?? null,
    }));
  }

  // Backward compat: log cũ chỉ lưu oil_level_mm + config theo trạm.
  // Config có thể là shape mới ({params:[...]}) hoặc shape cũ phẳng ({param_label,...}).
  if (log.oil_level_mm != null) {
    const cfg = paramConfigs ? paramConfigs[log.location] : null;
    const first = (cfg && Array.isArray(cfg.params) ? cfg.params[0] : cfg) || {};
    return [{
      tag:   first.tag ?? "",
      label: first.param_label ?? "",
      value: log.oil_level_mm,
      unit:  first.param_unit ?? "",
      low:   first.param_low ?? null,
      high:  first.param_high ?? null,
    }];
  }

  return [{ tag: "", label: "", value: null, unit: "", low: null, high: null }];
}

/**
 * Xuất lịch sử dạng LONG: mỗi thông số vận hành là 1 dòng. Lượt check-in có
 * nhiều thông số sẽ thành nhiều dòng (lặp lại các cột chung của lượt scan).
 *
 * @param {Array} logs - danh sách scan log
 * @param {Object} [paramConfigs] - map station_name → { param_low, param_high, ... }
 *   Nếu truyền vào, mỗi row sẽ có thêm cột "Cảnh báo" khi value ngoài giới hạn.
 */
/**
 * Link Google Maps tới vị trí scan để quản lý click kiểm tra vị trí nhân viên.
 * @returns {string} URL hoặc "" nếu log không có lat/lng.
 */
export function gpsMapsUrl(log) {
  const lat = log?.lat;
  const lng = log?.lng;
  if (lat == null || lng == null) return "";
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Dựng vừa rows (long format) vừa mảng log nguồn song song theo từng dòng —
 * worksheet builder cần log nguồn để gắn hyperlink GPS đúng dòng (1 log có thể
 * nở thành nhiều dòng theo số thông số).
 */
function buildHistoryRowsAndLogs(logs, paramConfigs) {
  const hasConfigs = paramConfigs != null;
  const rows = [];
  const rowLogs = [];

  logs.forEach((log) => {
    const base = {
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
    };

    buildParamEntries(log, paramConfigs).forEach((e) => {
      const row = {
        ...base,
        "Mã thiết bị":   e.tag || "",
        "Tên thông số":  e.label || "",
        "Giá trị":       e.value ?? "",
        "Đơn vị":        e.unit || "",
        "Giới hạn dưới": e.low ?? "",
        "Giới hạn trên": e.high ?? "",
      };

      if (hasConfigs) {
        const outOfRange = isOutOfRange(e.value ?? null, e.low ?? null, e.high ?? null);
        row["Cảnh báo"] = outOfRange
          ? `⚠️ Ngoài giới hạn (L:${e.low ?? "-"} / H:${e.high ?? "-"})`
          : "";
      }

      row["Email"] = log.email_sent ? "Đã gửi" : "Chưa gửi";
      rows.push(row);
      rowLogs.push(log);
    });
  });

  return { rows, rowLogs };
}

export function buildHistoryRows(logs, paramConfigs) {
  return buildHistoryRowsAndLogs(logs, paramConfigs).rows;
}

export function exportToExcel(rows, filename, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function _numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Dựng worksheet lịch sử với:
 *  - highlight đỏ cho "Giá trị" ngoài giới hạn (Giá trị vs Giới hạn dưới/trên)
 *  - hyperlink Google Maps trên cột "GPS" để click kiểm tra vị trí nhân viên
 * @param {Array} logs
 * @param {Object} [paramConfigs] - map station_name → { param_low, param_high }
 * @returns {object} XLSX worksheet
 */
export function buildHistoryWorksheet(logs, paramConfigs = undefined) {
  const { rows, rowLogs } = buildHistoryRowsAndLogs(logs, paramConfigs);
  const ws = XLSX.utils.json_to_sheet(rows);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    const valColIdx = headers.indexOf("Giá trị");
    const gpsColIdx = headers.indexOf("GPS");

    rows.forEach((row, i) => {
      // Màu đỏ cho cell "Giá trị" khi ngoài giới hạn
      if (valColIdx >= 0) {
        const val  = _numOrNull(row["Giá trị"]);
        const low  = _numOrNull(row["Giới hạn dưới"]);
        const high = _numOrNull(row["Giới hạn trên"]);
        if (isOutOfRange(val, low, high)) {
          const addr = XLSX.utils.encode_cell({ r: i + 1, c: valColIdx });
          if (ws[addr]) ws[addr].s = { font: { color: { rgb: "CC0000" }, bold: true } };
        }
      }

      // Hyperlink GPS → mở bản đồ tại vị trí scan (chỉ khi có lat/lng)
      if (gpsColIdx >= 0) {
        const url = gpsMapsUrl(rowLogs[i]);
        if (url) {
          const addr = XLSX.utils.encode_cell({ r: i + 1, c: gpsColIdx });
          if (ws[addr]) ws[addr].l = { Target: url, Tooltip: "Mở vị trí GPS trên bản đồ" };
        }
      }
    });
  }

  return ws;
}

/**
 * Xuất lịch sử (long format) với highlight đỏ cho giá trị ngoài giới hạn và
 * link bản đồ ở cột GPS.
 * @param {Array} logs
 * @param {string} filename
 * @param {Object} paramConfigs - map station_name → { param_low, param_high }
 */
export function exportHistoryToExcel(logs, filename, paramConfigs = {}) {
  const ws = buildHistoryWorksheet(logs, paramConfigs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lịch sử");
  XLSX.writeFile(wb, filename, { cellStyles: true });
}

/**
 * Dựng workbook lịch sử (giống exportHistoryToExcel) nhưng trả về chuỗi base64
 * thay vì tải file — để đính kèm vào email gửi qua backend.
 * @param {Array} logs
 * @param {Object} [paramConfigs] - map station_name → { param_low, param_high }
 * @returns {string} nội dung file .xlsx đã mã hóa base64
 */
export function buildHistoryWorkbookBase64(logs, paramConfigs = {}) {
  const ws = buildHistoryWorksheet(logs, paramConfigs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lịch sử");
  return XLSX.write(wb, { bookType: "xlsx", type: "base64", cellStyles: true });
}
