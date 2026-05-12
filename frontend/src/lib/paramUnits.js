/**
 * Preset đơn vị cho dropdown "Đơn vị" trong StationParamsPanel.
 * Thêm/bớt tại đây để cập nhật toàn bộ UI.
 */
export const PARAM_UNIT_OPTIONS = [
  { value: "mm",       label: "mm — chiều cao (tank level)" },
  { value: "kg/cm2g",  label: "kg/cm²g — áp suất" },
  { value: "%",        label: "% — phần trăm" },
  { value: "Yes/No",   label: "Yes/No — trạng thái" },
  { value: "°C",       label: "°C — nhiệt độ" },
  { value: "m³/h",     label: "m³/h — lưu lượng" },
  { value: "bar",      label: "bar — áp suất (bar)" },
  { value: "A",        label: "A — dòng điện" },
  { value: "kW",       label: "kW — công suất" },
];

/**
 * Kiểm tra value có trong danh sách preset không.
 */
export function isValidParamUnit(value) {
  if (!value || typeof value !== "string") return false;
  return PARAM_UNIT_OPTIONS.some(opt => opt.value === value);
}
