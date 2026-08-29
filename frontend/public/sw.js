// Logic phân loại request tách ra sw-routing.js để unit-test được (vitest).
importScripts("/sw-routing.js");

const CACHE = "qr-checklist-v11";

// App shell phụ — cache lúc install để mở app offline có đủ icon/font ngay cả
// khi runtime cache chưa kịp lưu (vd cài PWA xong tắt mạng luôn).
// Best-effort: thiếu file nào thì bỏ qua file đó, KHÔNG được làm fail install
// (cache.addAll fail 1 file là SW không bao giờ activate).
const SHELL_OPTIONAL = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/fonts/inter-latin-wght-normal.woff2",
  "/fonts/inter-latin-ext-wght-normal.woff2",
  "/fonts/inter-vietnamese-wght-normal.woff2",
];

// Install: cache shell — index.html bắt buộc, phần còn lại best-effort.
//
// KHÔNG gọi skipWaiting() ở đây: SW mới phải nằm chờ (waiting) cho tới khi user
// bấm "Cập nhật" trong app. Trước đây SW tự skipWaiting rồi clients.navigate()
// reload mọi tab — deploy đúng lúc nhân viên đang gõ thông số trong modal là
// mất sạch số đã nhập. Xem src/lib/swUpdate.js cho phía app.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.add("/index.html"); // bắt buộc — fallback cho mọi navigation offline
      await Promise.allSettled(SHELL_OPTIONAL.map((url) => c.add(url)));
    })
  );
});

// App gọi khi user đồng ý cập nhật → SW mới rời hàng chờ và activate.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Activate: xóa cache cũ → claim clients.
// Tab sẽ tự reload qua sự kiện controllerchange ở phía app (chỉ khi user đã đồng ý).
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first: lấy bản mới nhất, cập nhật cache, fallback cache khi offline
function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
      }
      return res;
    })
    .catch(() => caches.match(request));
}

// Cache-first: assets Vite có content-hash trong tên file → nội dung bất biến
// theo URL, trả cache ngay không chờ network (mở app tức thời trên mạng chậm).
// Miss (lần đầu sau deploy) → fetch rồi lưu cache cho các lần sau.
function cacheFirst(request) {
  return caches.match(request).then((hit) => hit || networkFirst(request));
}

// Fetch: chiến lược theo loại request — xem classifyRequest trong sw-routing.js
self.addEventListener("fetch", (e) => {
  const strategy = self.swRouting.classifyRequest(e.request);
  if (strategy === "ignore") return;

  // HTML navigation — network first, fallback index.html khi offline
  if (strategy === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (strategy === "cache-first") {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
});
