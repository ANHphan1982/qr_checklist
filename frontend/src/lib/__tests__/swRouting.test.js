import { describe, it, expect, beforeAll } from "vitest";

// sw-routing.js là classic script (service worker nạp qua importScripts, không
// phải ESM) — expose API lên self.swRouting. Test import side-effect rồi đọc
// từ global để dùng chung đúng 1 nguồn logic với sw.js.
let classifyRequest;

beforeAll(async () => {
  await import("../../../public/sw-routing.js");
  classifyRequest = self.swRouting.classifyRequest;
});

const ORIGIN = "https://qr-checklist.vercel.app";

describe("classifyRequest", () => {
  // --- ignore: SW không can thiệp, để browser tự xử lý ---
  it("bỏ qua request không phải GET", () => {
    expect(classifyRequest({ url: `${ORIGIN}/api/scan`, mode: "cors", method: "POST" })).toBe("ignore");
    expect(classifyRequest({ url: `${ORIGIN}/assets/index-abc.js`, mode: "no-cors", method: "HEAD" })).toBe("ignore");
  });

  it("bỏ qua API calls (kể cả GET)", () => {
    expect(classifyRequest({ url: `${ORIGIN}/api/reports?date=2026-07-11`, mode: "cors", method: "GET" })).toBe("ignore");
    expect(classifyRequest({ url: "https://qr-checklist-api.onrender.com/api/station-params", mode: "cors", method: "GET" })).toBe("ignore");
  });

  // --- navigate: network-first, fallback index.html (app shell) ---
  it("phân loại HTML navigation là navigate", () => {
    expect(classifyRequest({ url: `${ORIGIN}/history`, mode: "navigate", method: "GET" })).toBe("navigate");
    expect(classifyRequest({ url: `${ORIGIN}/`, mode: "navigate", method: "GET" })).toBe("navigate");
  });

  // --- cache-first: assets Vite có content-hash trong tên + font self-host ---
  // Nội dung bất biến theo URL → lấy từ cache trước, không cần chờ network.
  it("dùng cache-first cho assets build của Vite (/assets/)", () => {
    expect(classifyRequest({ url: `${ORIGIN}/assets/index-Be4TRY4a.js`, mode: "no-cors", method: "GET" })).toBe("cache-first");
    expect(classifyRequest({ url: `${ORIGIN}/assets/index-DN73L-Nm.css`, mode: "no-cors", method: "GET" })).toBe("cache-first");
    expect(classifyRequest({ url: `${ORIGIN}/assets/tank-BkaGFCUX.jpg`, mode: "no-cors", method: "GET" })).toBe("cache-first");
  });

  it("dùng cache-first cho fonts self-host (/fonts/)", () => {
    expect(classifyRequest({ url: `${ORIGIN}/fonts/inter-latin-wght-normal.woff2`, mode: "cors", method: "GET" })).toBe("cache-first");
  });

  // --- network-first: mọi thứ còn lại (icon, manifest... tên không có hash) ---
  it("dùng network-first cho file public không có content-hash", () => {
    expect(classifyRequest({ url: `${ORIGIN}/manifest.json`, mode: "no-cors", method: "GET" })).toBe("network-first");
    expect(classifyRequest({ url: `${ORIGIN}/icon-192.png`, mode: "no-cors", method: "GET" })).toBe("network-first");
  });

  it("fallback network-first khi URL không parse được", () => {
    expect(classifyRequest({ url: "not-a-valid-url", mode: "no-cors", method: "GET" })).toBe("network-first");
  });
});
