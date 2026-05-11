/**
 * QR alias map — mirror từ backend services/stations_config.py (QR_ALIAS_MAP).
 *
 * QR code dán tại trạm chứa mã thiết bị (vd: "052-LI-042B"), không phải tên
 * trạm ("TK-5211A"). Backend resolve alias server-side. Frontend cần bản sao
 * này để resolve trong offline path (không qua server).
 *
 * Admin cấu hình thông số vận hành bằng tên trạm thật (vd: "TK-5211A") —
 * resolveStationName giữ nguyên nếu input đã là tên trạm.
 *
 * Khi backend thêm trạm mới vào QR_ALIAS_MAP, cập nhật file này cùng lúc.
 */
export const QR_ALIAS_MAP = {
  "052-LI-022B": "TK-5201A",
  "052-LI-010B": "TK-5203A",
  "052-LI-001B": "TK-5207A",
  "052-LI-066B": "TK-5205A",
  "052-LI-042B": "TK-5211A",
  "052-LI-048B": "TK-5212A",
  "052-LI-075B": "TK-5213A",
  "052-LI-110B": "TK-5214",
  "052-LI-745":  "A-5205",
  "052-PG-703":  "A-5250",
  "052-PG-071":  "PUMP_STATION_7",
};

/**
 * Resolve QR text thành tên trạm.
 * - Nếu là alias (vd: "052-LI-042B") → trả về tên trạm ("TK-5211A")
 * - Nếu đã là tên trạm (vd: "TK-5211A") → giữ nguyên
 * - Admin config dùng tên trạm thật → không bị ảnh hưởng
 *
 * @param {string} qrText - nội dung raw từ QR code
 * @returns {string} tên trạm đã resolve
 */
export function resolveStationName(qrText) {
  return QR_ALIAS_MAP[qrText] || qrText;
}
