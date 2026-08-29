// swUpdate — quản lý vòng đời service worker theo hướng "hỏi trước khi cập nhật".
//
// Trước đây sw.js gọi skipWaiting() lúc install rồi tự clients.navigate() để
// reload mọi tab. Deploy đúng lúc nhân viên đang gõ thông số trong modal là mất
// sạch số đã nhập (state React, không persist). Giờ SW mới nằm ở trạng thái
// "waiting"; app hiện banner và chỉ kích hoạt khi user bấm "Cập nhật".
//
// Luồng đầy đủ:
//   1. SW mới install xong → state "installed" + đã có controller = đây là UPDATE
//   2. notify listeners → App.jsx hiện UpdateBanner
//   3. user bấm "Cập nhật" → applyUpdate() postMessage SKIP_WAITING
//   4. SW mới activate + claim → controllerchange → reload (chỉ khi user đã đồng ý)

export const SKIP_WAITING = "SKIP_WAITING";

let waitingWorker = null;
let updateRequested = false;
let reloading = false;
const listeners = new Set();

function setWaiting(worker) {
  if (waitingWorker === worker) return;
  waitingWorker = worker;
  listeners.forEach((fn) => fn(!!waitingWorker));
}

/**
 * Đăng ký lắng nghe "có bản cập nhật đang chờ".
 * Gọi callback ngay với trạng thái hiện tại để component mount muộn vẫn thấy.
 *
 * @param {(available: boolean) => void} fn
 * @returns {() => void} hàm hủy đăng ký
 */
export function onUpdateAvailable(fn) {
  listeners.add(fn);
  fn(!!waitingWorker);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Kích hoạt SW đang chờ. Reload thật sự xảy ra ở controllerchange, không phải
 * ở đây — SW cần thời gian activate.
 *
 * @returns {boolean} false nếu không có bản nào đang chờ
 */
export function applyUpdate() {
  if (!waitingWorker) return false;
  updateRequested = true;
  waitingWorker.postMessage({ type: SKIP_WAITING });
  return true;
}

/** Reset state giữa các test. */
export function __reset() {
  waitingWorker = null;
  updateRequested = false;
  reloading = false;
  listeners.clear();
}

/**
 * Đăng ký service worker + theo dõi bản cập nhật.
 *
 * @param {Navigator} [nav] inject để test
 * @param {{reload: () => void}} [onReload] inject để test (mặc định location.reload)
 */
export function registerServiceWorker(
  nav = typeof navigator !== "undefined" ? navigator : null,
  onReload = () => window.location.reload()
) {
  if (!nav || !("serviceWorker" in nav)) return Promise.resolve(null);

  nav.serviceWorker.addEventListener("controllerchange", () => {
    // Chỉ reload khi CHÍNH user vừa bấm "Cập nhật". Lần cài SW đầu tiên cũng
    // bắn controllerchange (do clients.claim) — reload lúc đó là vô nghĩa và
    // phá flow đang chạy.
    if (!updateRequested || reloading) return;
    reloading = true;
    onReload();
  });

  return nav.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      if (!reg) return null;
      // SW mới đã chờ sẵn từ lần mở app trước.
      if (reg.waiting && nav.serviceWorker.controller) setWaiting(reg.waiting);

      reg.addEventListener?.("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          // Có controller = app đang chạy bằng SW cũ → đây là bản cập nhật.
          // Không có controller = cài lần đầu → kích hoạt im lặng, không hỏi.
          if (incoming.state === "installed" && nav.serviceWorker.controller) {
            setWaiting(incoming);
          }
        });
      });
      return reg;
    })
    .catch(() => null);
}
