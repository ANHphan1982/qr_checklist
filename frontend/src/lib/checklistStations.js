// checklistStations — helper thuần thao tác map "checklist → [tên trạm]".
//
// Hướng A: mapping được lưu Ở BACKEND (cột stations.checklist_type) và đọc qua
// GET /api/checklist-stations → mọi điện thoại thấy giống nhau. File này chỉ còn
// các hàm thuần để dựng/tra cứu map (không còn localStorage).

// Danh sách trạm của 1 checklist (luôn trả mảng).
export function getStationsFor(map, checklistId) {
  const list = map?.[checklistId];
  return Array.isArray(list) ? list : [];
}

export function isAssigned(map, checklistId, stationName) {
  return getStationsFor(map, checklistId).includes(stationName);
}

// Dựng map {checklist_type: [name, ...]} từ danh sách trạm (mỗi trạm có .name,
// .checklist_type, .active). Chỉ lấy trạm active và có gán checklist_type.
export function assignmentsFromStations(stations) {
  const map = {};
  for (const st of stations || []) {
    if (st.active === false) continue;
    const ct = st.checklist_type;
    if (!ct) continue;
    (map[ct] ||= []).push(st.name);
  }
  return map;
}
