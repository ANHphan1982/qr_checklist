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
 *
 * gpsData có thể chứa flag `cached: true` khi vị trí lấy từ localStorage
 * (chip GPS fail tại điểm scan). Server đánh dấu geo_status="cached" để admin
 * phân biệt với fix GPS thật tại thời điểm scan.
 *
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
    if (gpsData.cached) {
      payload.geo_cached = true;
      if (typeof gpsData.cache_age_ms === "number") {
        payload.cache_age_ms = gpsData.cache_age_ms;
      }
    }
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
    if (item.geo_cached) {
      payload.geo_cached = true;
      if (typeof item.cache_age_ms === "number") {
        payload.cache_age_ms = item.cache_age_ms;
      }
    }
  }
  if (item.oil_level_mm != null) {
    payload.oil_level_mm = item.oil_level_mm;
  }
  try {
    const { data } = await api.post("/api/scan", payload);
    return data;
  } catch (err) {
    const httpStatus = err?.response?.status;
    // Bất kỳ 4xx nào = server đã hiểu và từ chối — retry sẽ không giúp được gì.
    // Xoá khỏi queue để tránh item bị kẹt vĩnh viễn.
    // (OUT_OF_RANGE đã được lưu DB; các mã khác thì scan bị bỏ qua.)
    if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) {
      return err.response?.data || {};
    }
    // Network error hoặc 5xx → ném lỗi để flushQueue giữ item và retry lần sau
    throw err;
  }
}

/**
 * Lấy danh sách cấu hình thông số vận hành (public — dùng ở scan flow).
 * @returns {Promise<Array<{station_name, param_label, param_unit, active}>>}
 */
export async function getStationParamConfigs() {
  const { data } = await api.get("/api/station-params");
  return data.configs || [];
}

// ---------------------------------------------------------------------------
// Admin — station params
// ---------------------------------------------------------------------------
function adminApi(adminKey) {
  return axios.create({
    baseURL: import.meta.env.VITE_API_URL || "",
    timeout: 15000,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
  });
}

export async function getAdminStationParams(adminKey) {
  const { data } = await adminApi(adminKey).get("/api/admin/station-params");
  return data;
}

export async function createAdminStationParam(adminKey, body) {
  const { data } = await adminApi(adminKey).post("/api/admin/station-params", body);
  return data;
}

export async function updateAdminStationParam(adminKey, id, body) {
  const { data } = await adminApi(adminKey).put(`/api/admin/station-params/${id}`, body);
  return data;
}

export async function deleteAdminStationParam(adminKey, id) {
  const { data } = await adminApi(adminKey).delete(`/api/admin/station-params/${id}`);
  return data;
}

/**
 * Cập nhật thông số vận hành (Mức dầu mm) cho một lần scan đã lưu.
 */
export async function patchScanParams(scanId, params) {
  const { data } = await api.patch(`/api/scan/${scanId}/params`, params);
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

/**
 * Kiểm tra kết nối đến backend — dùng để chẩn đoán lỗi mạng.
 *
 * Short-circuit khi thiết bị đang offline (airplane mode) để không đổ oan cho
 * CORS/firewall: browser đã tự biết không có mạng, gọi HTTP chỉ lãng phí 15s.
 *
 * @returns {{ ok: boolean, detail: string }}
 */
export async function checkConnectivity() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      ok: false,
      offline: true,
      detail: "Thiết bị đang offline (chế độ máy bay / mất mạng) — tắt airplane mode hoặc bật WiFi/4G rồi thử lại",
    };
  }
  try {
    const { data } = await api.get("/api/debug/connectivity", { timeout: 15000 });
    return { ok: true, detail: `Server OK · Origin: ${data.request_origin} · CORS env: ${data.cors_origin_env}` };
  } catch (err) {
    const status = err?.response?.status;
    if (status) return { ok: false, detail: `HTTP ${status} — server phản hồi nhưng báo lỗi` };
    if (err.code === "ECONNABORTED") return { ok: false, detail: "Timeout — server không phản hồi trong 15 giây" };
    return { ok: false, detail: `Không có phản hồi — CORS hoặc server down (${err.message})` };
  }
}
