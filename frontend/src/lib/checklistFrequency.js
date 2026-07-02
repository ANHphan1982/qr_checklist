// checklistFrequency — tần suất ghi thông số HIỆU LỰC cho mỗi checklist.
//
// Thứ tự ưu tiên: override admin (localStorage) > mặc định catalog
// (checklists.js `frequency`) > shift (giữ hành vi cũ "1 lần/ca").
//
// Lưu localStorage theo THIẾT BỊ (không có DB cho tính năng này) — coverage ở
// HomePage tính phía frontend nên đọc trực tiếp giá trị hiệu lực này.

import { getFrequencyById } from "./frequencies";

export const DEFAULT_FREQUENCY_ID = "shift";
const KEY = "qr_checklist_frequency";

/**
 * Chọn tần suất hiệu lực cho 1 checklist (thuần — overrides truyền tham số).
 * @param {{id, frequency}} checklist - mục catalog
 * @param {Object<string,string>} overrides - map checklistId → frequencyId
 */
export function resolveFrequencyId(checklist, overrides) {
  const ov = overrides?.[checklist?.id];
  if (ov && getFrequencyById(ov)) return ov;
  const def = checklist?.frequency;
  if (def && getFrequencyById(def)) return def;
  return DEFAULT_FREQUENCY_ID;
}

/** Đọc map override từ localStorage; {} nếu chưa có / lỗi / JSON hỏng. */
export function loadFrequencyOverrides() {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch (_) {
    return {};
  }
}

/**
 * Đặt tần suất override cho 1 checklist. frequencyId rỗng/không hợp lệ → GỠ
 * override (quay về mặc định catalog). Trả về map override mới.
 */
export function setChecklistFrequency(checklistId, frequencyId) {
  const cur = loadFrequencyOverrides();
  if (!checklistId) return cur;
  if (!frequencyId || !getFrequencyById(frequencyId)) {
    delete cur[checklistId];
  } else {
    cur[checklistId] = frequencyId;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch (_) {
    /* private mode / quota — bỏ qua */
  }
  return cur;
}

/** Tần suất hiệu lực (đọc override từ localStorage). */
export function getEffectiveFrequencyId(checklist, overrides = loadFrequencyOverrides()) {
  return resolveFrequencyId(checklist, overrides);
}
