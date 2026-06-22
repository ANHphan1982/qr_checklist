// checklistStations — gán trạm đã cấu hình vào từng checklist (pump/routine/...).
// Lưu thuần trong localStorage của trình duyệt admin (không đụng backend).
//
// Cấu trúc mapping: { [checklistId]: string[] }  — danh sách TÊN trạm.
// Một trạm có thể thuộc nhiều checklist (mỗi checklist tick độc lập).

export const STORAGE_KEY = "checklist_stations_v1";

// Đọc mapping từ localStorage; lỗi parse / không có → {} (không ném).
export function loadAssignments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAssignments(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
}

// Danh sách trạm của 1 checklist (luôn trả mảng).
export function getStationsFor(map, checklistId) {
  const list = map?.[checklistId];
  return Array.isArray(list) ? list : [];
}

export function isAssigned(map, checklistId, stationName) {
  return getStationsFor(map, checklistId).includes(stationName);
}

// Bật/tắt 1 trạm cho 1 checklist — trả map MỚI (không mutate input).
export function toggleStation(map, checklistId, stationName) {
  const current = getStationsFor(map, checklistId);
  const next = current.includes(stationName)
    ? current.filter((n) => n !== stationName)
    : [...current, stationName];
  return { ...map, [checklistId]: next };
}
