/**
 * TDD — lib/geolocation.js
 */
import { describe, it, expect, vi } from "vitest";
import { getCurrentPosition, checkGpsPermission, GEO_ERRORS } from "../geolocation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGeolocation(overrides = {}) {
  const defaults = {
    getCurrentPosition: (success) =>
      success({
        coords: { latitude: 10.823, longitude: 106.629, accuracy: 5 },
      }),
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { geolocation: { ...defaults, ...overrides } },
    writable: true,
  });
}

function mockPermissions(state) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      geolocation: {
        getCurrentPosition: (success) =>
          success({ coords: { latitude: 0, longitude: 0, accuracy: 0 } }),
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state }),
      },
    },
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// getCurrentPosition
// ---------------------------------------------------------------------------

describe("getCurrentPosition", () => {
  it("resolves with lat/lng/accuracy on success", async () => {
    mockGeolocation();
    const pos = await getCurrentPosition();
    expect(pos.lat).toBe(10.823);
    expect(pos.lng).toBe(106.629);
    expect(pos.accuracy).toBe(5);
  });

  it("rejects with PERMISSION_DENIED message on error code 1", async () => {
    mockGeolocation({ getCurrentPosition: (_, error) => error({ code: 1 }) });
    await expect(getCurrentPosition()).rejects.toThrow(GEO_ERRORS.PERMISSION_DENIED);
  });

  it("rejects with POSITION_UNAVAILABLE message on error code 2", async () => {
    mockGeolocation({ getCurrentPosition: (_, error) => error({ code: 2 }) });
    await expect(getCurrentPosition()).rejects.toThrow(GEO_ERRORS.POSITION_UNAVAILABLE);
  });

  it("rejects with TIMEOUT message on error code 3", async () => {
    mockGeolocation({ getCurrentPosition: (_, error) => error({ code: 3 }) });
    await expect(getCurrentPosition()).rejects.toThrow(GEO_ERRORS.TIMEOUT);
  });

  it("rejects with UNSUPPORTED when navigator.geolocation missing", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, writable: true });
    await expect(getCurrentPosition()).rejects.toThrow(GEO_ERRORS.UNSUPPORTED);
  });

  it("rejects with generic message for unknown error code", async () => {
    mockGeolocation({ getCurrentPosition: (_, error) => error({ code: 99 }) });
    await expect(getCurrentPosition()).rejects.toThrow("GPS không xác định");
  });
});

// ---------------------------------------------------------------------------
// checkGpsPermission  ← RED: chưa implement → sẽ fail
// ---------------------------------------------------------------------------

describe("checkGpsPermission", () => {
  it("returns 'granted' when permission is granted", async () => {
    mockPermissions("granted");
    expect(await checkGpsPermission()).toBe("granted");
  });

  it("returns 'prompt' when permission needs to be asked", async () => {
    mockPermissions("prompt");
    expect(await checkGpsPermission()).toBe("prompt");
  });

  it("returns 'denied' when permission is denied", async () => {
    mockPermissions("denied");
    expect(await checkGpsPermission()).toBe("denied");
  });

  it("returns 'unknown' when Permissions API not available", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { geolocation: {} },
      writable: true,
    });
    expect(await checkGpsPermission()).toBe("unknown");
  });

  it("returns 'unknown' when query() throws", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        permissions: { query: vi.fn().mockRejectedValue(new Error("unsupported")) },
      },
      writable: true,
    });
    expect(await checkGpsPermission()).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Airplane mode / offline — options must target satellite GPS
// Khi bật chế độ máy bay, WiFi và cell đều tắt nên chỉ còn chip GPS.
// enableHighAccuracy PHẢI là true và timeout đủ dài cho cold-fix không A-GPS.
// ---------------------------------------------------------------------------

describe("getCurrentPosition — airplane mode (offline)", () => {
  function captureOptions(onlineValue) {
    const spy = vi.fn((success) =>
      success({ coords: { latitude: 0, longitude: 0, accuracy: 0 } })
    );
    Object.defineProperty(globalThis, "navigator", {
      value: {
        onLine: onlineValue,
        geolocation: { getCurrentPosition: spy },
      },
      writable: true,
    });
    return spy;
  }

  it("enableHighAccuracy = true khi offline (chỉ GPS chip còn hoạt động)", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.enableHighAccuracy).toBe(true);
  });

  it("timeout >= 20000ms khi offline (GPS cold-fix không có A-GPS cần lâu)", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.timeout).toBeGreaterThanOrEqual(20000);
  });

  it("maximumAge rộng khi offline để ưu tiên cache nếu có", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.maximumAge).toBeGreaterThanOrEqual(300000);
  });

  it("enableHighAccuracy = true khi online (mặc định high accuracy)", async () => {
    const spy = captureOptions(true);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.enableHighAccuracy).toBe(true);
  });

  it("cho phép override options qua tham số", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition({ timeout: 5000, enableHighAccuracy: false });
    const options = spy.mock.calls[0][2];
    expect(options.timeout).toBe(5000);
    expect(options.enableHighAccuracy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GEO_ERRORS constants
// ---------------------------------------------------------------------------

describe("GEO_ERRORS", () => {
  it("has all required keys", () => {
    expect(GEO_ERRORS.PERMISSION_DENIED).toBeDefined();
    expect(GEO_ERRORS.POSITION_UNAVAILABLE).toBeDefined();
    expect(GEO_ERRORS.TIMEOUT).toBeDefined();
    expect(GEO_ERRORS.UNSUPPORTED).toBeDefined();
  });

  it("all messages are non-empty strings", () => {
    for (const msg of Object.values(GEO_ERRORS)) {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
