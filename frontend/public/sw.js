const CACHE = "qr-checklist-v8";

// Install: chỉ cache shell index.html để offline hoạt động
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add("/index.html"))
  );
  self.skipWaiting(); // kích hoạt SW mới ngay lập tức
});

// Activate: xóa cache cũ → claim clients → tự reload tất cả tab
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
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
