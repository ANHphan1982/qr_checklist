const CACHE = "qr-checklist-v9";

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

// Fetch: network-first cho tất cả (luôn lấy bản mới nhất từ server)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/")) return; // bỏ qua API calls

  // HTML navigation — network first, fallback index.html khi offline
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // JS/CSS/images — network first, cập nhật cache, fallback cache khi offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
