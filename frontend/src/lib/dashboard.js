/**
 * lib/dashboard.js — Helper thuần định dạng dữ liệu analytics cho DashboardPage.
 *
 * Server (services/dashboard_service.py) đã tổng hợp sẵn; frontend chỉ format để
 * vẽ chart bằng CSS/SVG thuần (không thêm thư viện — npm registry bị chặn).
 */

// Giá trị lớn nhất trong heatmap (để scale chiều cao cột). 0 nếu rỗng.
export function heatmapMax(hours) {
  if (!Array.isArray(hours) || hours.length === 0) return 0;
  return hours.reduce((m, v) => (v > m ? v : m), 0);
}

// Index giờ có nhiều scan nhất; null nếu rỗng hoặc toàn 0. Hòa → index nhỏ nhất.
export function busiestHour(hours) {
  if (!Array.isArray(hours) || hours.length === 0) return null;
  let best = -1;
  let bestVal = 0;
  for (let h = 0; h < hours.length; h++) {
    if (hours[h] > bestVal) {
      bestVal = hours[h];
      best = h;
    }
  }
  return best === -1 ? null : best;
}

// Giờ → "HH:00"
export function formatHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

// Tỷ lệ 0..1 → chuỗi phần trăm. digits = số chữ số thập phân (mặc định 0).
export function formatPercent(rate, digits = 0) {
  return `${(rate * 100).toFixed(digits)}%`;
}

// Hướng xu hướng → ký hiệu mũi tên.
export function trendSymbol(direction) {
  if (direction === "down") return "↓";
  if (direction === "up") return "↑";
  return "→";
}
