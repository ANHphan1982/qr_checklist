/**
 * resolveParamStatus — validate thông số vận hành theo ngưỡng cấu hình.
 *
 * Mỗi ngưỡng xét ĐỘC LẬP — config 1 ngưỡng (chỉ low hoặc chỉ high) vẫn cảnh báo.
 * Khớp với backend services/threshold_service.py để cảnh báo đỏ (UI) và email
 * cảnh báo (server) luôn nhất quán.
 *
 * @param {string|number|null|undefined} value  - giá trị người dùng nhập
 * @param {number|null|undefined} low           - ngưỡng thấp
 * @param {number|null|undefined} high          - ngưỡng cao
 * @returns {{ status: 'empty'|'normal'|'warning', color: string, message: string|null }}
 */
export function resolveParamStatus(value, low, high) {
  const num = parseFloat(value);
  if (value === "" || value === null || value === undefined || isNaN(num)) {
    return { status: "empty", color: "neutral", message: null };
  }

  const hasLow = low != null;
  const hasHigh = high != null;
  const belowLow = hasLow && num < low;
  const aboveHigh = hasHigh && num > high;

  if (belowLow || aboveHigh) {
    let message;
    if (hasLow && hasHigh) {
      message = `Ngoài ngưỡng bình thường (${low}–${high})`;
    } else if (belowLow) {
      message = `Thấp hơn ngưỡng (≥ ${low})`;
    } else {
      message = `Cao hơn ngưỡng (≤ ${high})`;
    }
    return { status: "warning", color: "warning", message };
  }

  return { status: "normal", color: "success", message: null };
}
