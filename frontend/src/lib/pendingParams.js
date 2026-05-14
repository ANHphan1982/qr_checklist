const KEY = "qr_pending_params";

export function savePendingParams(stationName, config, queuedAt) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ stationName, config, queuedAt }));
  } catch (_) {}
}

export function loadPendingParams() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function clearPendingParams() {
  localStorage.removeItem(KEY);
}
