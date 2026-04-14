import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 15000, // 15s — đủ cho Render cold start ~30s nhưng UI sẽ hiện warning sau 5s
  headers: { "Content-Type": "application/json" },
});

/**
 * Ghi nhận lượt scan QR, kèm GPS nếu có.
 * @param {string} location
 * @param {string} deviceId
 * @param {{ lat, lng, accuracy }|null} gpsData
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
 * @param {string} [date]  - YYYY-MM-DD, mặc định hôm nay
 */
export async function getReports(date) {
  const params = date ? { date } : {};
  const { data } = await api.get("/api/reports", { params });
  return data;
}
