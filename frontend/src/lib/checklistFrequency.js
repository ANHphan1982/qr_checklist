// checklistFrequency — tần suất ghi thông số HIỆU LỰC cho mỗi checklist.
//
// Thứ tự ưu tiên: override admin (localStorage) > mặc định catalog
// (checklists.js `frequency`) > shift (giữ hành vi cũ "1 lần/ca").
//
// Lưu localStorage theo THIẾT BỊ (không có DB cho tính năng này) — coverage ở
// HomePage tính phía frontend nên đọc trực tiếp giá trị hiệu lực này.

import { getFrequencyById, sanitizeMonthDay } from "./frequencies";

export const DEFAULT_FREQUENCY_ID = "shift";
const KEY = "qr_checklist_frequency";

// Giá trị override: chuỗi frequencyId, hoặc descriptor {id:"month", monthDay}
// khi month có ngày chốt ≠ 1. Chuẩn hoá về {id, monthDay?}; null nếu không hợp lệ.
function normalizeSetting(value) {
  const id = typeof value === "string" ? value : value?.id;
  if (!id || !getFrequencyById(id)) return null;
  const monthDay = id === "month" ? sanitizeMonthDay(value?.monthDay) : undefined;
  return monthDay && monthDay !== 1 ? { id, monthDay } : { id };
}

/**
 * Setting tần suất hiệu lực cho 1 checklist (thuần — overrides truyền tham số).
 * @param {{id, frequency}} checklist - mục catalog
 * @param {Object<string,string|{id,monthDay}>} overrides - map checklistId → giá trị override
 * @returns {{id: string, monthDay?: number}} — truyền thẳng cho getPeriodAt
 */
export function resolveFrequencySetting(checklist, overrides) {
  const ov = normalizeSetting(overrides?.[checklist?.id]);
  if (ov) return ov;
  const def = normalizeSetting(checklist?.frequency);
  if (def) return def;
  return { id: DEFAULT_FREQUENCY_ID };
}

/** Tần suất hiệu lực dạng id chuỗi (chỗ chỉ cần id, vd nhãn ngắn). */
export function resolveFrequencyId(checklist, overrides) {
  return resolveFrequencySetting(checklist, overrides).id;
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
 * override (quay về mặc định catalog). opts.monthDay (2..31, chỉ với month)
 * → lưu descriptor {id, monthDay}. Trả về map override mới.
 */
export function setChecklistFrequency(checklistId, frequencyId, opts) {
  const cur = loadFrequencyOverrides();
  if (!checklistId) return cur;
  if (!frequencyId || !getFrequencyById(frequencyId)) {
    delete cur[checklistId];
  } else {
    const monthDay = frequencyId === "month" ? sanitizeMonthDay(opts?.monthDay) : undefined;
    cur[checklistId] =
      monthDay && monthDay !== 1 ? { id: frequencyId, monthDay } : frequencyId;
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

/** Setting hiệu lực {id, monthDay?} (đọc override từ localStorage). */
export function getEffectiveFrequencySetting(checklist, overrides = loadFrequencyOverrides()) {
  return resolveFrequencySetting(checklist, overrides);
}
