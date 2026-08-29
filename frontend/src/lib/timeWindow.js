// timeWindow — phát hiện "cửa sổ thời gian" hiện tại đã sang mốc mới hay chưa.
//
// Bối cảnh: app là PWA dán trên điện thoại trực ca, gần như không bao giờ được
// reload. HomePage/ScanPage đóng băng mốc `now` lúc mount để ca + chu kỳ tính
// nhất quán trong một phiên xem. Nhưng nếu máy để mở qua 18:00 (giao ca) hoặc
// qua nửa đêm, mốc đóng băng đó khiến tiến độ và cảnh báo "còn N trạm" hiển thị
// theo ca CŨ cho tới khi user kill app — sai số liệu ngay trên màn hình chính.
//
// Hai mốc cần theo dõi:
//   • Ranh giới ca (06:00 / 18:00 giờ VN) — ảnh hưởng coverage theo ca
//   • Ranh giới ngày VN (00:00)           — ảnh hưởng chu kỳ ngày/tuần/tháng
//     (mốc tháng luôn rơi vào nửa đêm nên đổi ngày là đủ để bắt được)

import { getShiftAt, VN_OFFSET_MIN } from "./shifts";

/**
 * Khóa ngày theo giờ tường Việt Nam ("YYYY-MM-DD").
 * Dịch offset rồi đọc qua UTC → không phụ thuộc timezone của máy.
 *
 * @param {number} ms instant UTC (ms)
 * @returns {string}
 */
export function vnDateKey(ms, offsetMin = VN_OFFSET_MIN) {
  return new Date(ms + offsetMin * 60000).toISOString().slice(0, 10);
}

/**
 * Mốc `nowMs` đã rơi sang ca khác hoặc ngày VN khác so với `prevMs` chưa.
 * Dùng để quyết định có làm mới mốc thời gian đóng băng của trang hay không —
 * trả false ở trường hợp thường gặp nhất (cùng ca, cùng ngày) để không gây
 * re-render / refetch vô ích.
 *
 * @param {number} prevMs mốc đang giữ
 * @param {number} nowMs  mốc hiện tại
 * @returns {boolean}
 */
export function hasWindowRolledOver(prevMs, nowMs) {
  if (!Number.isFinite(prevMs) || !Number.isFinite(nowMs)) return false;
  if (nowMs <= prevMs) return false;
  if (vnDateKey(prevMs) !== vnDateKey(nowMs)) return true;
  return getShiftAt(new Date(prevMs)).startMs !== getShiftAt(new Date(nowMs)).startMs;
}
