import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: BASE,
  timeout: 90000, // 90s — Render free tier cold start có thể mất 30-60s
  headers: { "Content-Type": "application/json" },
});

/**
 * Ping server để wake up Render free tier trước khi scan.
 * Gọi khi app load — không block UI, không throw.
 */
export async function pingServer() {
  try {
    await axios.get(`${BASE}/health`, { timeout: 60000 });
  } catch (_) {
    // bỏ qua — chỉ để wake up
  }
}

/**
 * Ghi nhận lượt scan QR, kèm GPS nếu có.
 */
export async function postScan(location, deviceId, gpsData = null, scannedAt = null) {
  const payload = {
    location,
    device_id: deviceId,
    scanned_at: scannedAt || new Date().toISOString(),
  };

  if (gpsData) {
    payload.lat = gpsData.lat;
    payload.lng = gpsData.lng;
    payload.accuracy = gpsData.accuracy;
  }

  const { data } = await api.post("/api/scan", payload);
  return data;
}

/**
 * Gửi 1 item từ offline queue lên server.
 * Item có dạng: { location, device_id, scanned_at, lat?, lng?, accuracy? }
 *
 * Resolve (không throw) với các 4xx "expected":
 *  - 403 OUT_OF_RANGE : scan đã được lưu DB, chỉ cảnh báo vị trí → xoá khỏi queue
 *  - 400 RATE_LIMITED : đã check-in quá nhiều lần → bỏ qua, không retry mãi
 * Các lỗi network / 5xx → vẫn throw để giữ item trong queue và retry sau.
 */
export async function postQueuedScan(item) {
  const payload = {
    location: item.location,
    device_id: item.device_id,
    scanned_at: item.scanned_at,
  };
  if (item.lat != null) {
    payload.lat = item.lat;
    payload.lng = item.lng;
    payload.accuracy = item.accuracy;
  }
  try {
    const { data } = await api.post("/api/scan", payload);
    return data;
  } catch (err) {
    const code = err?.response?.data?.code;
    // Đây là kết quả "đã xử lý" ở server — xoá khỏi queue, không retry
    if (code === "OUT_OF_RANGE" || code === "RATE_LIMITED") {
      return err.response.data;
    }
    // Network error hoặc 5xx → ném lỗi để flushQueue giữ item và retry lần sau
    throw err;
  }
}

/**
 * Lấy danh sách scan theo ngày.
 */
export async function getReports(date) {
  const params = date ? { date } : {};
  const { data } = await api.get("/api/reports", { params });
  return data;
}
