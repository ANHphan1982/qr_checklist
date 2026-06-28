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
