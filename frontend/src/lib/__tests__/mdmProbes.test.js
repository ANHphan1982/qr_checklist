/**
 * TDD — lib/mdmProbes.js
 *
 * Covers the airplane-mode regression: MdmCheckPage.probeGps() trước đây
 * hardcode timeout 15s + fallback sang low-accuracy (WiFi/cell — đều tắt trong
 * airplane mode) nên luôn báo TIMEOUT dù GPS chip hoàn toàn khả dụng.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { probeGps } from "../mdmProbes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setNavigator(overrides) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, ...overrides },
    writable: true,
    configurable: true,
  });
}

function setSecureContext(secure) {
  Object.defineProperty(globalThis, "window", {
    value: { isSecureContext: secure },
    writable: true,
    configurable: true,
  });
  // vitest jsdom also exposes isSecureContext on globalThis
  globalThis.isSecureContext = secure;
}

function timeoutError() {
  return { code: 3, message: "Timeout expired" };
}

beforeEach(() => {
  setSecureContext(true);
  // performance.now() cần có trong jsdom
  if (!globalThis.performance) globalThis.performance = { now: () => 0 };
});

// ---------------------------------------------------------------------------
// Offline (airplane mode) behaviour
// ---------------------------------------------------------------------------

describe("probeGps — offline / airplane mode", () => {
  it("dùng timeout >= 30000ms khi offline (GPS cold-fix không A-GPS cần 30-60s)", async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err(timeoutError()));
    setNavigator({
      onLine: false,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    await probeGps();

    const opts = getCurrentPosition.mock.calls[0][2];
    expect(opts.enableHighAccuracy).toBe(true);
    expect(opts.timeout).toBeGreaterThanOrEqual(30000);
  });

  it("KHÔNG fallback sang low-accuracy khi offline (WiFi/cell đều tắt)", async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err(timeoutError()));
    setNavigator({
      onLine: false,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    await probeGps();

    // chỉ gọi 1 lần — không thử lại với low-accuracy
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("message khi TIMEOUT + offline phải nhắc airplane mode, không dùng 'ra ngoài trời' chung chung", async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err(timeoutError()));
    setNavigator({
      onLine: false,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    const result = await probeGps();

    expect(result.status).toBe("fail");
    expect(result.detail.toLowerCase()).toMatch(/máy bay|airplane/);
  });

  it("trả về PASS nếu high-accuracy lấy được vị trí khi offline", async () => {
    const getCurrentPosition = vi.fn((ok) =>
      ok({ coords: { latitude: 10.1, longitude: 106.2, accuracy: 20 } })
    );
    setNavigator({
      onLine: false,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    const result = await probeGps();

    expect(result.status).toBe("pass");
    expect(result.detail).toMatch(/high-accuracy/i);
  });
});

// ---------------------------------------------------------------------------
// Online behaviour — giữ nguyên UX cũ
// ---------------------------------------------------------------------------

describe("probeGps — online", () => {
  it("vẫn fallback sang low-accuracy khi online và high-accuracy fail", async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_ok, err) => err(timeoutError()))
      .mockImplementationOnce((ok) =>
        ok({ coords: { latitude: 10.1, longitude: 106.2, accuracy: 500 } })
      );
    setNavigator({
      onLine: true,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    const result = await probeGps();

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("pass");
  });

  it("cả high + low đều fail TIMEOUT → detail gợi ý ra ngoài trời", async () => {
    const getCurrentPosition = vi.fn((_ok, err) => err(timeoutError()));
    setNavigator({
      onLine: true,
      geolocation: { getCurrentPosition },
      permissions: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });

    const result = await probeGps();

    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/ngoài trời|thoáng/i);
  });
});

// ---------------------------------------------------------------------------
// Error pre-conditions
// ---------------------------------------------------------------------------

describe("probeGps — pre-conditions", () => {
  it("FAIL nếu navigator.geolocation không tồn tại", async () => {
    setNavigator({ onLine: true });
    const result = await probeGps();
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/không hỗ trợ|unsupported/i);
  });

  it("FAIL nếu không phải secure context", async () => {
    setSecureContext(false);
    setNavigator({
      onLine: true,
      geolocation: { getCurrentPosition: vi.fn() },
    });
    const result = await probeGps();
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/HTTPS|secure/i);
  });
});
