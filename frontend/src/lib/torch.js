/**
 * lib/torch.js — Hỗ trợ scan QR trong điều kiện thiếu sáng (đêm, ngoài trời).
 *
 * Browser exposes đèn pin qua MediaStreamTrack capabilities:
 *   track.getCapabilities().torch === true       → device hỗ trợ
 *   track.applyConstraints({ advanced: [{ torch }] }) → bật/tắt
 *
 * Lưu ý:
 * - Chỉ Android Chrome / Edge hỗ trợ ổn định. iOS Safari hiện chưa expose torch
 *   → hasTorchSupport() trả về false, nút sẽ bị ẩn ở UI.
 * - Một số device từ chối applyConstraints → wrap try/catch, không throw.
 */

export function hasTorchSupport(track) {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    const caps = track.getCapabilities();
    return Boolean(caps?.torch);
  } catch {
    return false;
  }
}

export async function setTorch(track, on) {
  if (!hasTorchSupport(track)) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: Boolean(on) }] });
    return true;
  } catch {
    return false;
  }
}
