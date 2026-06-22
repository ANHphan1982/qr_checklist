// shifts — chia ngày thành 2 ca theo giờ Việt Nam (UTC+7, không DST).
//   Ca ngày  (day):   06:00 → 18:00
//   Ca đêm   (night):  18:00 → 06:00 hôm sau (vắt qua nửa đêm)
//
// Dùng để biết mỗi trạm đã được kiểm tra đủ 1 lần/ca chưa (xem checklistCoverage).
// Tính theo "giờ tường" VN bằng offset cố định → không phụ thuộc timezone máy.

export const SHIFT_DAY = "day";
export const SHIFT_NIGHT = "night";
export const VN_OFFSET_MIN = 7 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Thành phần giờ-tường VN của 1 Date (đọc qua UTC sau khi dịch offset).
function vnParts(date, offsetMin) {
  const vn = new Date(date.getTime() + offsetMin * 60000);
  return { y: vn.getUTCFullYear(), mo: vn.getUTCMonth(), d: vn.getUTCDate(), h: vn.getUTCHours() };
}

// Instant (ms UTC) ứng với giờ-tường VN {y,mo,d} lúc `hour:00`.
function vnWallToUtcMs(p, hour, offsetMin) {
  return Date.UTC(p.y, p.mo, p.d, hour, 0, 0) - offsetMin * 60000;
}

/**
 * Ca chứa thời điểm `date`.
 * @returns {{id, label, startMs, endMs}} startMs/endMs là instant UTC (ms).
 */
export function getShiftAt(date, offsetMin = VN_OFFSET_MIN) {
  const p = vnParts(date, offsetMin);

  if (p.h >= 6 && p.h < 18) {
    return {
      id: SHIFT_DAY,
      label: "Ca ngày (06:00–18:00)",
      startMs: vnWallToUtcMs(p, 6, offsetMin),
      endMs: vnWallToUtcMs(p, 18, offsetMin),
    };
  }

  if (p.h >= 18) {
    // Ca đêm: 18:00 hôm nay → 06:00 hôm sau.
    return {
      id: SHIFT_NIGHT,
      label: "Ca đêm (18:00–06:00)",
      startMs: vnWallToUtcMs(p, 18, offsetMin),
      endMs: vnWallToUtcMs(p, 6, offsetMin) + DAY_MS,
    };
  }

  // p.h < 6 → ca đêm bắt đầu 18:00 hôm trước.
  return {
    id: SHIFT_NIGHT,
    label: "Ca đêm (18:00–06:00)",
    startMs: vnWallToUtcMs(p, 18, offsetMin) - DAY_MS,
    endMs: vnWallToUtcMs(p, 6, offsetMin),
  };
}

/** scan (Date) có nằm trong ca không — [start, end). */
export function isWithinShift(date, shift) {
  const t = date.getTime();
  return t >= shift.startMs && t < shift.endMs;
}
