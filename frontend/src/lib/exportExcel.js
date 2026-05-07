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

const SCREEN_CLASS_LABEL = {
  clean:      "Bình thường",
  suspicious: "Nghi vấn",
  high_risk:  "Nguy cơ cao",
};

const MOTION_CLASS_LABEL = {
  clean:       "Bình thường",
  suspicious:  "Nghi vấn (phẳng)",
  high_risk:   "Nguy cơ cao (phẳng)",
  unavailable: "Camera quá yên",
};

function roundOrEmpty(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return "";
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Convert 0-1 score → 0-100 integer percentage. Trả "" khi null/undefined
// (phân biệt với score=0 vẫn hiển thị 0 vì là giá trị hợp lệ).
function pctOrEmpty(value) {
  if (value == null || Number.isNaN(value)) return "";
  return Math.round(value * 100);
}

function toVnDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const date = d.toLocaleDateString("vi-VN", { timeZone: VN_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} ${time}`;
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

export function buildHistoryRows(logs) {
  return logs.map((log) => {
    const sig = log.screen_signals || {};
    return {
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
      "Nghi vấn màn hình":               SCREEN_CLASS_LABEL[log.screen_class] || "",
      "Điểm nghi vấn (%)":               pctOrEmpty(log.screen_score),
      "Flicker (%)":                     pctOrEmpty(sig.flicker),
      "Uniformity (%)":                  pctOrEmpty(sig.uniformity),
      "Moiré (%)":                       pctOrEmpty(sig.moire),
      "Motion Score (%)":                pctOrEmpty(sig.motion_score),
      "Motion Class":                    MOTION_CLASS_LABEL[sig.motion_class] || "",
      "Email":                           log.email_sent ? "Đã gửi" : "Chưa gửi",
    };
  });
}

export function exportToExcel(rows, filename, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
