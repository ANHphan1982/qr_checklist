/**
 * Preset đơn vị cho dropdown "Đơn vị" trong StationParamsPanel.
 * Thêm/bớt tại đây để cập nhật toàn bộ UI.
 */
export const PARAM_UNIT_OPTIONS = [
  { value: "mm",      label: "mm" },
  { value: "kg/cm2g", label: "kg/cm2g" },
  { value: "%",       label: "%" },
  { value: "Yes",     label: "Yes" },
  { value: "No",      label: "No" },
  { value: "°C",      label: "°C" },
  { value: "m³/h",    label: "m³/h" },
  { value: "bar",     label: "bar" },
  { value: "A",       label: "A" },
  { value: "kW",      label: "kW" },
];

/**
 * Kiểm tra value có trong danh sách preset không.
 */
export function isValidParamUnit(value) {
  if (!value || typeof value !== "string") return false;
  return PARAM_UNIT_OPTIONS.some(opt => opt.value === value);
}

// Các đơn vị "có/không" — thông số nhập TEXT (Y/N/Yes/No) thay vì số.
const YES_NO_UNITS = new Set(["yes/no", "y/n", "yes", "no"]);

/**
 * Đơn vị dạng Yes/No → ô nhập là text (Y, N, Yes, No...) thay vì số,
 * và không áp ngưỡng low/high.
 */
export function isYesNoUnit(unit) {
  if (!unit || typeof unit !== "string") return false;
  return YES_NO_UNITS.has(unit.trim().toLowerCase());
}
