// scanChecklist — gộp catalog checklist + mapping trạm (assignments) + coverage
// trong ca để ScanPage hiển thị ngữ cảnh: đang quét checklist nào, còn trạm nào
// chưa kiểm tra. Thuần logic — UI chỉ render kết quả.

import { getChecklistById } from "./checklists";
import { getStationsFor } from "./checklistStations";
import { computeCoverage } from "./checklistCoverage";

/**
 * @param {string} type - id checklist (từ URL /scan/:type)
 * @param {Object<string,string[]>} assignments - map checklist → [tên trạm]
 * @param {Array} scans - scan logs (đã enrich)
 * @param {object} shift - từ getShiftAt
 * @returns {null | {
 *   id, title, hasAssignments:boolean, total:number,
 *   checkedCount:number, missing:string[], allDone:boolean
 * }} null nếu type không có trong catalog.
 */
export function buildScanChecklistInfo(type, assignments, scans, shift) {
  const meta = getChecklistById(type);
  if (!meta) return null;

  const stationNames = getStationsFor(assignments, type);
  if (stationNames.length === 0) {
    return {
      id: meta.id,
      title: meta.title,
      hasAssignments: false,
      total: 0,
      checkedCount: 0,
      missing: [],
      allDone: false,
    };
  }

  const cov = computeCoverage(stationNames, scans, shift);
  return {
    id: meta.id,
    title: meta.title,
    hasAssignments: true,
    total: cov.total,
    checkedCount: cov.checked.length,
    missing: cov.missing,
    allDone: cov.ok,
  };
}

/**
 * Giới hạn số chip trạm còn thiếu hiển thị để không chiếm hết màn hình khi
 * checklist có nhiều trạm. Khi `expanded` → hiện tất cả.
 *
 * @param {string[]} stations - danh sách trạm còn thiếu
 * @param {number} limit - số chip tối đa khi thu gọn
 * @param {boolean} expanded - đã bấm "Xem tất cả" chưa
 * @returns {{visible: string[], hiddenCount: number}}
 */
export function splitMissingStations(stations, limit, expanded) {
  const list = Array.isArray(stations) ? stations : [];
  if (expanded || list.length <= limit) {
    return { visible: list, hiddenCount: 0 };
  }
  return { visible: list.slice(0, limit), hiddenCount: list.length - limit };
}
