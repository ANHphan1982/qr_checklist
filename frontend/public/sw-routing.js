// sw-routing.js — logic phân loại request cho service worker.
// Classic script (KHÔNG phải ESM): sw.js nạp qua importScripts("/sw-routing.js"),
// vitest nạp qua side-effect import rồi đọc self.swRouting — 1 nguồn logic duy nhất.
(function (root) {
  "use strict";

  // Đường dẫn bất biến: Vite build ra /assets/<tên>-<content-hash>.<ext>,
  // fonts self-host không bao giờ đổi nội dung → an toàn để cache-first.
  var IMMUTABLE_PREFIXES = ["/assets/", "/fonts/"];

  /**
   * Phân loại 1 fetch request thành chiến lược xử lý của SW:
   *  - "ignore"        : không can thiệp (non-GET, API call)
   *  - "navigate"      : HTML navigation — network-first, fallback index.html
   *  - "cache-first"   : asset bất biến — trả cache ngay, miss mới ra network
   *  - "network-first" : còn lại — network trước, fallback cache khi offline
   *
   * @param {{url: string, mode: string, method: string}} request
   * @returns {"ignore"|"navigate"|"cache-first"|"network-first"}
   */
  function classifyRequest(request) {
    if (request.method !== "GET") return "ignore";
    if (request.url.indexOf("/api/") !== -1) return "ignore";
    if (request.mode === "navigate") return "navigate";

    var pathname;
    try {
      pathname = new URL(request.url).pathname;
    } catch (_) {
      return "network-first";
    }

    for (var i = 0; i < IMMUTABLE_PREFIXES.length; i++) {
      if (pathname.indexOf(IMMUTABLE_PREFIXES[i]) === 0) return "cache-first";
    }
    return "network-first";
  }

  root.swRouting = { classifyRequest: classifyRequest };
})(typeof self !== "undefined" ? self : globalThis);
