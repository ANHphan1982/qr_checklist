/**
 * resolveParamStatus — validate thông số vận hành theo ngưỡng cấu hình.
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

  const hasRange = low != null && high != null;
  if (hasRange && (num < low || num > high)) {
    return {
      status:  "warning",
      color:   "warning",
      message: `Ngoài ngưỡng bình thường (${low}–${high})`,
    };
  }

  return { status: "normal", color: "success", message: null };
}
