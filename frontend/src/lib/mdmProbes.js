// ---------------------------------------------------------------------------
// MDM diagnostic probes — tách khỏi MdmCheckPage để test được.
//
// Offline-aware: khi navigator.onLine === false (airplane mode), chỉ chip GPS
// vệ tinh còn hoạt động. Phải kéo dài timeout cho cold-fix không A-GPS và
// KHÔNG fallback sang low-accuracy (WiFi/cell đều tắt → chỉ tốn thêm 10s).
// ---------------------------------------------------------------------------

export const STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PASS: "pass",
  FAIL: "fail",
  WARN: "warn",
};

const GEO_ERR_NAME = {
  1: "PERMISSION_DENIED",
  2: "POSITION_UNAVAILABLE",
  3: "TIMEOUT",
};

function tryGetPosition(opts) {
  return new Promise((resolve) => {
    const t0 = (globalThis.performance?.now?.() ?? Date.now());
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          ms: Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) =>
        resolve({
          ok: false,
          ms: Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0),
          code: err.code,
          name: GEO_ERR_NAME[err.code] || "UNKNOWN",
          message: err.message || "",
        }),
      opts
    );
  });
}

export async function probeGps() {
  if (!navigator.geolocation) {
    return {
      status: STATUS.FAIL,
      detail: "navigator.geolocation không tồn tại — trình duyệt không hỗ trợ GPS",
    };
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return {
      status: STATUS.FAIL,
      detail: "Không phải secure context (HTTPS) — browser chặn GPS API",
    };
  }

  const isOffline = navigator.onLine === false;
  const lines = [];
  lines.push(`isSecureContext: ${typeof window !== "undefined" ? window.isSecureContext : "n/a"}`);
  lines.push(`onLine: ${navigator.onLine}`);

  // Permissions API state
  let permState = "unknown";
  if (navigator.permissions) {
    try {
      const p = await navigator.permissions.query({ name: "geolocation" });
      permState = p.state;
    } catch (e) {
      permState = `query-error:${e.message || "unknown"}`;
    }
  }
  lines.push(`permissions.state: ${permState}`);

  // Probe 1: high-accuracy (chip GPS).
  // Offline: 30s timeout cho GPS cold-fix không A-GPS, đồng bộ với lib/geolocation.js.
  const hi = await tryGetPosition({
    enableHighAccuracy: true,
    timeout: isOffline ? 30000 : 15000,
    maximumAge: isOffline ? 300000 : 0,
  });
  lines.push(
    hi.ok
      ? `high-accuracy: OK ${hi.ms}ms, acc=${Math.round(hi.accuracy)}m`
      : `high-accuracy: FAIL ${hi.ms}ms, code=${hi.code} ${hi.name}${hi.message ? ` — ${hi.message}` : ""}`
  );

  // Probe 2: low-accuracy fallback — CHỈ khi online.
  // Airplane mode tắt WiFi/cell → network positioning vô dụng, tốn thêm 10s.
  let lo = null;
  if (!hi.ok && !isOffline) {
    lo = await tryGetPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
    lines.push(
      lo.ok
        ? `low-accuracy: OK ${lo.ms}ms, acc=${Math.round(lo.accuracy)}m`
        : `low-accuracy: FAIL ${lo.ms}ms, code=${lo.code} ${lo.name}${lo.message ? ` — ${lo.message}` : ""}`
    );
  } else if (!hi.ok && isOffline) {
    lines.push("low-accuracy: SKIP — offline (airplane mode tắt WiFi/cell, chỉ chip GPS còn)");
  }

  // Kết luận
  let status = STATUS.FAIL;
  let summary = "";
  if (hi.ok || (lo && lo.ok)) {
    status = STATUS.PASS;
    const best = hi.ok ? hi : lo;
    summary = `GPS OK — accuracy ~${Math.round(best.accuracy)}m (${hi.ok ? "high-accuracy" : "low-accuracy"})`;
  } else {
    const code = hi.code;
    if (code === 1) {
      status = STATUS.WARN;
      summary =
        "PERMISSION_DENIED — user hoặc MDM từ chối quyền. " +
        "Settings → Apps → Chrome/Edge → Permissions → Location → Allow only while using. " +
        "Nếu site-level bị denied: Chrome Settings → Site Settings → Location → xóa site khỏi Blocked";
    } else if (code === 2) {
      status = STATUS.FAIL;
      summary =
        "POSITION_UNAVAILABLE — không có nguồn vị trí nào. " +
        "Kiểm tra: (1) Location Services OS master switch ON, (2) chế độ High accuracy, " +
        "(3) ra ngoài trời để GPS bắt được vệ tinh, (4) không đang airplane mode";
    } else if (code === 3) {
      status = STATUS.FAIL;
      summary = isOffline
        ? "TIMEOUT (chế độ máy bay) — WiFi/cell đã tắt, chỉ còn chip GPS vệ tinh. " +
          "Cold-fix không A-GPS cần 30–60s ngoài trời hoặc gần cửa sổ. " +
          "Nếu vẫn timeout sau 1 phút: tắt airplane mode rồi bật lại, hoặc reboot thiết bị"
        : "TIMEOUT — browser không lấy được vị trí trong thời gian chờ. " +
          "GPS cold-fix có thể cần 30–60s ngoài trời. Thử lại sau khi đi ra chỗ thoáng";
    } else {
      summary = `Lỗi không xác định (code=${code})`;
    }
  }

  return {
    status,
    detail: `${summary}\n\n${lines.join("\n")}`,
  };
}
