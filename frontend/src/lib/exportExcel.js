import * as XLSX from "xlsx";

const VN_TZ = "Asia/Ho_Chi_Minh";

const GEO_LABEL = {
  ok:           "Đúng trạm",
  out_of_range: "Ngoài phạm vi",
  no_gps:       "Không có GPS",
};

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
  return logs.map((log) => ({
    "ID":               log.id,
    "Trạm":             log.location,
    "Thời gian (VN)":   toVnDateTime(log.scanned_at),
    "Device ID":        log.device_id || "",
    "GPS":              GEO_LABEL[log.geo_status] || log.geo_status || "",
    "Khoảng cách (m)":  log.geo_distance != null ? log.geo_distance : "",
    "Email":            log.email_sent ? "Đã gửi" : "Chưa gửi",
  }));
}

export function exportToExcel(rows, filename, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
