/**
 * Tạo device ID từ userAgent + timestamp, lưu vào localStorage.
 * Dùng localStorage (không phải sessionStorage) để consistent giữa các lần mở app.
 */
export function getDeviceId() {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    const ua = navigator.userAgent;
    const ts = Date.now().toString(36);
    deviceId = btoa(ua).slice(0, 20) + "-" + ts;
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

/**
 * Format ISO datetime sang dd/MM/yyyy HH:mm:ss (múi giờ VN).
 */
export function formatDateTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Ghép class Tailwind có điều kiện */
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
