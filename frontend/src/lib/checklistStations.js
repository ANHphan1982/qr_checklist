// checklistStations — helper thuần thao tác map "checklist → [tên trạm]".
//
// Hướng A: mapping được lưu Ở BACKEND (cột stations.checklist_types) và đọc qua
// GET /api/checklist-stations → mọi điện thoại thấy giống nhau. File này chỉ còn
// các hàm thuần để dựng/tra cứu map (không còn localStorage).
//
// Một trạm có thể thuộc NHIỀU checklist: nguồn chuẩn là mảng `checklist_types`;
// `checklist_type` (single) chỉ giữ cho dữ liệu cũ chưa migrate (fallback).

// Danh sách checklist (chuẩn hoá) của 1 trạm — ưu tiên checklist_types (mảng),
// fallback checklist_type (single). Lowercase, bỏ rỗng, dedupe giữ thứ tự.
export function getChecklistTypesOf(station) {
  if (!station) return [];
  const raw = Array.isArray(station.checklist_types)
    ? station.checklist_types
    : station.checklist_type
    ? [station.checklist_type]
    : [];
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const v = String(c).trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// Danh sách trạm của 1 checklist (luôn trả mảng).
export function getStationsFor(map, checklistId) {
  const list = map?.[checklistId];
  return Array.isArray(list) ? list : [];
}

export function isAssigned(map, checklistId, stationName) {
  return getStationsFor(map, checklistId).includes(stationName);
}

// Dựng map {checklist_type: [name, ...]} từ danh sách trạm (mỗi trạm có .name,
// .checklist_types/.checklist_type, .active). Chỉ lấy trạm active đã gán; trạm
// thuộc nhiều checklist xuất hiện dưới mỗi key.
export function assignmentsFromStations(stations) {
  const map = {};
  for (const st of stations || []) {
    if (st.active === false) continue;
    for (const ct of getChecklistTypesOf(st)) {
      (map[ct] ||= []).push(st.name);
    }
  }
  return map;
}
