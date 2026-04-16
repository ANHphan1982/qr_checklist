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
  const { data } = await api.post("/api/scan", payload);
  return data;
}

/**
 * Lấy danh sách scan theo ngày.
 */
export async function getReports(date) {
  const params = date ? { date } : {};
  const { data } = await api.get("/api/reports", { params });
  return data;
}
