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
