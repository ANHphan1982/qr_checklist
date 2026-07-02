// frequencies — danh mục tần suất ghi thông số của mỗi checklist + tính "chu kỳ"
// hiện tại theo giờ VN (UTC+7, không DST).
//
// Mỗi checklist yêu cầu ghi thông số ≥1 lần / chu kỳ. Chu kỳ tuỳ tần suất:
//   shift  — mỗi ca vận hành (06:00–18:00 / 18:00–06:00), dùng lại shifts.js
//   4h/8h/12h — cửa sổ N giờ căn theo nửa đêm VN (vd 8h: 00–08, 08–16, 16–24)
//   day    — ngày lịch VN (00:00 → 24:00)
//   month  — tháng lịch VN, reset ngày 1 (ngày cố định trong tháng)
//
// getPeriodAt trả cửa sổ {id, label, startMs, endMs} CÙNG shape với getShiftAt
// → checklistCoverage.computeCoverage nhận trực tiếp, không phải sửa logic cũ.

import { getShiftAt } from "./shifts";

export const VN_OFFSET_MIN = 7 * 60;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// `hours` = độ dài cửa sổ (giờ) cho loại canh theo giờ. shift/day/month xử lý riêng.
export const FREQUENCIES = [
  { id: "shift", label: "Mỗi ca (12h)",  short: "1 lần/ca"    },
  { id: "4h",    label: "4 giờ/lần",     short: "4h/lần",  hours: 4  },
  { id: "8h",    label: "8 giờ/lần",     short: "8h/lần",  hours: 8  },
  { id: "12h",   label: "12 giờ/lần",    short: "12h/lần", hours: 12 },
  { id: "day",   label: "Mỗi ngày",      short: "1 lần/ngày"  },
  { id: "month", label: "Mỗi tháng",     short: "1 lần/tháng" },
];

const DEFAULT_ID = "shift";

/** Tra cứu tần suất theo id; undefined nếu không tồn tại / id rỗng. */
export function getFrequencyById(id) {
  if (!id) return undefined;
  return FREQUENCIES.find((f) => f.id === id);
}

// Thành phần giờ-tường VN của 1 Date (đọc qua UTC sau khi dịch offset).
function vnParts(date, offsetMin) {
  const vn = new Date(date.getTime() + offsetMin * 60000);
  return { y: vn.getUTCFullYear(), mo: vn.getUTCMonth(), d: vn.getUTCDate(), h: vn.getUTCHours() };
}

// Instant (ms UTC) ứng với giờ-tường VN {y,mo,d} lúc `hour:00`.
function vnWallToUtcMs(p, hour, offsetMin) {
  return Date.UTC(p.y, p.mo, p.d, hour, 0, 0) - offsetMin * 60000;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayLabel(p) {
  return `Ngày ${pad2(p.d)}/${pad2(p.mo + 1)}/${p.y}`;
}

/**
 * Cửa sổ chu kỳ chứa thời điểm `date` cho tần suất `frequencyId`.
 * @returns {{id, label, startMs, endMs}} startMs/endMs là instant UTC (ms),
 *          khoảng [startMs, endMs) — cùng shape với getShiftAt.
 */
export function getPeriodAt(frequencyId, date, offsetMin = VN_OFFSET_MIN) {
  const freq = getFrequencyById(frequencyId) || getFrequencyById(DEFAULT_ID);

  if (freq.id === "shift") {
    const sh = getShiftAt(date, offsetMin);
    return { id: "shift", label: sh.label, startMs: sh.startMs, endMs: sh.endMs };
  }

  const p = vnParts(date, offsetMin);
  const midnightMs = vnWallToUtcMs(p, 0, offsetMin);

  if (freq.id === "day") {
    return {
      id: "day",
      label: dayLabel(p),
      startMs: midnightMs,
      endMs: midnightMs + DAY_MS,
    };
  }

  if (freq.id === "month") {
    const startMs = Date.UTC(p.y, p.mo, 1, 0, 0, 0) - offsetMin * 60000;
    const endMs = Date.UTC(p.y, p.mo + 1, 1, 0, 0, 0) - offsetMin * 60000;
    return { id: "month", label: `Tháng ${pad2(p.mo + 1)}/${p.y}`, startMs, endMs };
  }

  // Canh theo giờ: chia ngày VN thành các cửa sổ N giờ căn từ nửa đêm.
  const winMs = freq.hours * HOUR_MS;
  const idx = Math.floor((date.getTime() - midnightMs) / winMs);
  const startMs = midnightMs + idx * winMs;
  const endMs = startMs + winMs;
  const startH = idx * freq.hours;
  const endH = startH + freq.hours;
  return {
    id: freq.id,
    label: `${pad2(startH)}:00–${pad2(endH)}:00 ${pad2(p.d)}/${pad2(p.mo + 1)}`,
    startMs,
    endMs,
  };
}

/**
 * Liệt kê các ngày VN (YYYY-MM-DD) phủ khoảng [startMs, endMs]. Dùng để biết
 * cần tải report của những ngày nào cho một chu kỳ (chu kỳ dài như tháng vắt
 * qua nhiều ngày VN). Bao gồm cả ngày chứa startMs lẫn ngày chứa endMs.
 */
export function vnDatesInRange(startMs, endMs, offsetMin = VN_OFFSET_MIN) {
  const toVn = (ms) => new Date(ms + offsetMin * 60000).toISOString().slice(0, 10);
  const first = vnParts(new Date(startMs), offsetMin);
  let cursor = Date.UTC(first.y, first.mo, first.d, 0, 0, 0) - offsetMin * 60000;
  const out = [];
  // Cận trên: nửa đêm VN của ngày chứa endMs (để vòng lặp luôn dừng).
  const last = vnParts(new Date(endMs), offsetMin);
  const lastMidnight = Date.UTC(last.y, last.mo, last.d, 0, 0, 0) - offsetMin * 60000;
  while (cursor <= lastMidnight) {
    out.push(toVn(cursor));
    cursor += DAY_MS;
  }
  return out;
}
