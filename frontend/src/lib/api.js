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
export async function postScan(location, deviceId, gpsData = null) {
  const payload = {
    location,
    device_id: deviceId,
    scanned_at: new Date().toISOString(),
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
 * Lấy danh sách scan theo ngày.
 */
export async function getReports(date) {
  const params = date ? { date } : {};
  const { data } = await api.get("/api/reports", { params });
  return data;
}
