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

/**
 * Số hiển thị trên thẻ checklist ở HomePage (đã kiểm tra / tổng trạm).
 * ƯU TIÊN coverage thật (`cov`) để KHỚP với dòng cảnh báo bên dưới thẻ. Chỉ khi
 * chưa có coverage (checklist chưa gán trạm) mới dùng `fallbackTotal` của catalog.
 *
 * @param {{total:number, missingCount:number}|null|undefined} cov - từ computeCoverage
 * @param {number} [fallbackTotal=0] - tổng trạm tĩnh khi chưa có coverage
 * @returns {{checked:number, total:number}}
 */
export function checklistCardCounts(cov, fallbackTotal = 0) {
  if (cov) {
    return { checked: cov.total - cov.missingCount, total: cov.total };
  }
  return { checked: 0, total: fallbackTotal };
}

/**
 * Tổng hợp coverage của NHIỀU checklist (map id → {total, missingCount}) thành
 * số liệu cho thẻ tổng quan ca ở HomePage.
 *
 * @param {Object<string,{total:number, missingCount:number}>} coverageMap
 * @returns {{totalStations, checkedStations, missingStations, allDone, hasData}}
 */
export function summarizeCoverage(coverageMap) {
  const list = Object.values(coverageMap || {});
  let totalStations = 0;
  let missingStations = 0;
  for (const c of list) {
    totalStations += c.total || 0;
    missingStations += c.missingCount || 0;
  }
  return {
    totalStations,
    missingStations,
    checkedStations: totalStations - missingStations,
    allDone: list.length > 0 && missingStations === 0,
    hasData: list.length > 0,
  };
}

/**
 * Lọc scan logs thuộc các trạm của 1 checklist, NẰM TRONG ca hiện tại, sắp xếp
 * theo thời gian tăng dần. Giữ nguyên mọi lượt scan (không gộp 1 lần/trạm như
 * computeCoverage) để xuất Excel cùng cấu trúc đầy đủ với trang Lịch sử.
 *
 * @param {string[]} stationNames - trạm thuộc checklist
 * @param {Array} scans - scan logs (đã enrich từ /reports: route assessment, lat/lng…)
 * @param {object} shift - từ getShiftAt
 * @returns {Array} logs đã lọc + sắp xếp (giữ nguyên field gốc của từng log)
 */
export function selectChecklistShiftLogs(stationNames, scans, shift) {
  const wanted = new Set(stationNames);
  return (scans || [])
    .filter((s) => wanted.has(s.location) && isWithinShift(new Date(s.scanned_at), shift))
    .sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
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
