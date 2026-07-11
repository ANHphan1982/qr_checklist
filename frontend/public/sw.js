// Logic phân loại request tách ra sw-routing.js để unit-test được (vitest).
importScripts("/sw-routing.js");

const CACHE = "qr-checklist-v10";

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

// true = đây là UPDATE (đã có SW cũ đang chạy), false = cài lần đầu.
// Chỉ UPDATE mới cần force-reload tab; reload ở lần cài đầu vừa vô nghĩa
// vừa phá flow đang chạy (user vừa mở app đã bị reload).
let isUpdate = false;

// Install: cache shell — index.html bắt buộc, phần còn lại best-effort
self.addEventListener("install", (e) => {
  isUpdate = !!self.registration.active;
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.add("/index.html"); // bắt buộc — fallback cho mọi navigation offline
      await Promise.allSettled(SHELL_OPTIONAL.map((url) => c.add(url)));
    })
  );
  self.skipWaiting(); // kích hoạt SW mới ngay lập tức
});

// Activate: xóa cache cũ → claim clients → reload tab NẾU là update (deploy mới)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => (isUpdate ? self.clients.matchAll({ type: "window" }) : []))
      .then((clients) => {
        clients.forEach((c) => c.navigate(c.url)); // tự reload — không cần cài lại
      })
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
