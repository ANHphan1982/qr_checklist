/**
 * buildQrMatrix — sinh ma trận QR local, không phụ thuộc service bên ngoài.
 *
 * Trước đây màn hình trạm render QR qua api.qrserver.com: (1) gửi nội dung
 * token sang bên thứ 3, (2) chết hoàn toàn trên WiFi nội bộ không có internet.
 * Thư viện qrcode-generator được vendor vào lib/vendor/ (registry npm bị chặn
 * — xem memory npm-registry-blocked-vendor-via-jsdelivr).
 */
import qrcode from "./vendor/qrcode-generator.js";

// Tên trạm có thể chứa tiếng Việt — encode UTF-8 thay vì byte đơn mặc định
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

/**
 * @param {string} content - nội dung QR (token / tên trạm)
 * @param {"L"|"M"|"Q"|"H"} ecc - mức sửa lỗi, mặc định H (in dán ngoài trời)
 * @returns {boolean[][]} ma trận vuông, true = module đen
 */
export function buildQrMatrix(content, ecc = "H") {
  const qr = qrcode(0, ecc); // typeNumber 0 = tự chọn version nhỏ nhất đủ chứa
  qr.addData(content, "Byte");
  qr.make();

  const n = qr.getModuleCount();
  const matrix = [];
  for (let r = 0; r < n; r += 1) {
    const row = [];
    for (let c = 0; c < n; c += 1) {
      row.push(qr.isDark(r, c));
    }
    matrix.push(row);
  }
  return matrix;
}
