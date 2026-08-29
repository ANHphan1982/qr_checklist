// continuousScan — chế độ quét liên tục: camera KHÔNG tắt sau mỗi lần check-in.
//
// Vì sao cần: một vòng checklist có tới 13 trạm. Ở flow cũ mỗi trạm là một chu
// kỳ idle → scanning → done → tap → idle → tap, và camera bị unmount ngay khi
// QR vừa decode (bước gps/sending không còn `scanning`). Nghĩa là mỗi trạm phải
// khởi động lại camera ~1–2s, mất luôn mức zoom và trạng thái đèn đã chỉnh.
//
// Chế độ liên tục giữ scanner sống qua cả gps/sending/params/done rồi tự
// resume() — html5-qrcode `pause(true)` giữ video alive nên resume gần như tức thì.
//
// Ba hằng số điều phối nhịp:
//   • RESUME_MS       — chờ trước khi decode lại, để user kịp hạ máy khỏi mã cũ
//   • SAME_QR_COOLDOWN— chặn quét lại ĐÚNG mã vừa quét (camera vẫn đang chĩa vào
//                       nó) → tránh tạo scan rác rồi ăn RATE_LIMITED
//   • IDLE_TIMEOUT_MS — không quét được gì thêm thì trả camera + wake lock về OS,
//                       tránh đốt pin suốt quãng đường đi bộ giữa hai trạm

const KEY = "qr_continuous_scan";

/** Chờ bao lâu sau một lần check-in rồi mới decode tiếp (ms). */
export const RESUME_MS = 1800;

/** Bỏ qua đúng mã vừa quét trong khoảng này (ms). */
export const SAME_QR_COOLDOWN_MS = 10000;

/** Không có lần quét thành công nào trong khoảng này → tự tắt camera (ms). */
export const IDLE_TIMEOUT_MS = 60000;

/** Các bước mà camera vẫn phải sống trong chế độ liên tục. */
export const CAMERA_ALIVE_STEPS = ["scanning", "gps", "sending", "params", "done"];

/**
 * Camera có được mount ở bước này không.
 * Chế độ thường: chỉ khi đang `scanning` (giữ nguyên hành vi cũ).
 *
 * @param {string} step
 * @param {boolean} continuous
 * @returns {boolean}
 */
export function shouldShowCamera(step, continuous) {
  return continuous ? CAMERA_ALIVE_STEPS.includes(step) : step === "scanning";
}

/**
 * Có bỏ qua lần decode này vì trùng mã vừa quét không.
 * Chạy ĐỒNG BỘ trong callback decode của QRScanner: trả true thì scanner không
 * pause, cứ decode tiếp — nếu pause rồi mới bỏ qua thì scanner kẹt vĩnh viễn.
 *
 * @param {{text: string, ts: number}|null} last lần quét được chấp nhận gần nhất
 * @param {string} text nội dung QR vừa decode
 * @param {number} nowMs
 * @param {number} [cooldownMs]
 * @returns {boolean}
 */
export function shouldIgnoreDuplicate(last, text, nowMs, cooldownMs = SAME_QR_COOLDOWN_MS) {
  if (!last || !last.text) return false;
  if (last.text !== text) return false;
  if (!Number.isFinite(last.ts) || !Number.isFinite(nowMs)) return false;
  return nowMs - last.ts < cooldownMs;
}

/** Đọc lựa chọn đã lưu. Mặc định BẬT — đây là mặc định nhanh hơn cho vòng nhiều trạm. */
export function loadContinuousMode() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch (_) {
    return true;
  }
}

/** Lưu lựa chọn theo thiết bị. */
export function saveContinuousMode(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch (_) {
    /* private mode / quota — bỏ qua */
  }
}
