// checklistCoverage — với danh sách trạm của 1 checklist + scan logs, tính
// trong CA hiện tại trạm nào đã/chưa được kiểm tra (yêu cầu ≥1 lần/ca) và dựng
// dòng Excel để tra cứu. Thuần logic — UI (HomePage) chỉ hiển thị kết quả.

import { isWithinShift } from "./shifts";

const VN_TZ = "Asia/Ho_Chi_Minh";

function fmtVn(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("vi-VN", { timeZone: VN_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} ${time}`;
}

// Map trạm → scan MỚI NHẤT trong ca (hoặc undefined nếu chưa có).
function latestInShift(stationNames, scans, shift) {
  const wanted = new Set(stationNames);
  const latest = new Map();
  for (const s of scans || []) {
    if (!wanted.has(s.location)) continue;
    if (!isWithinShift(new Date(s.scanned_at), shift)) continue;
    const prev = latest.get(s.location);
    if (!prev || new Date(s.scanned_at) > new Date(prev.scanned_at)) latest.set(s.location, s);
  }
  return latest;
}

/**
 * @param {string[]} stationNames - trạm thuộc checklist
 * @param {Array} scans - [{location, scanned_at}]
 * @param {object} shift - từ getShiftAt
 * @returns {{total, checked:string[], missing:string[], missingCount, ok:boolean}}
 */
export function computeCoverage(stationNames, scans, shift) {
  const latest = latestInShift(stationNames, scans, shift);
  const checked = stationNames.filter((n) => latest.has(n));
  const missing = stationNames.filter((n) => !latest.has(n));
  return {
    total: stationNames.length,
    checked,
    missing,
    missingCount: missing.length,
    ok: missing.length === 0,
  };
}

/** Dòng Excel: mỗi trạm 1 dòng — trạng thái kiểm tra trong ca + lần gần nhất. */
export function buildChecklistShiftRows(stationNames, scans, shift) {
  const latest = latestInShift(stationNames, scans, shift);
  return stationNames.map((name) => {
    const hit = latest.get(name);
    return {
      "Trạm": name,
      "Ca": shift.label,
      "Trạng thái": hit ? "Đã kiểm tra" : "⚠️ Chưa kiểm tra",
      "Lần kiểm tra gần nhất": hit ? fmtVn(hit.scanned_at) : "",
    };
  });
}
