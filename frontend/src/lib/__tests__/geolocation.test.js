/**
 * TDD — lib/geolocation.js
 */
import { describe, it, expect, vi } from "vitest";
import { getCurrentPosition, checkGpsPermission, classifyAccuracy, GEO_ERRORS } from "../geolocation.js";

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

  // Bug trước đây: maximumAge=300000 (5 phút) khi offline khiến browser trả
  // cache của lần scan trước thay vì gọi GPS chip ở lần scan kế tiếp.
  // Mỗi scan check-in phải là vị trí TẠI THỜI ĐIỂM đó, không được tái sử dụng.
  it("maximumAge <= 15s khi offline — không tái sử dụng cache giữa 2 lần scan", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.maximumAge).toBeLessThanOrEqual(15000);
  });

  // Không đặt 0 hoàn toàn — cho phép tolerance ngắn để user double-tap
  // không phải chờ cold-fix lần 2. 5-10s là đủ.
  it("maximumAge > 0 khi offline — cho phép cache ngắn hạn tránh cold-fix double-tap", async () => {
    const spy = captureOptions(false);
    await getCurrentPosition();
    const options = spy.mock.calls[0][2];
    expect(options.maximumAge).toBeGreaterThan(0);
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
    expect(GEO_ERRORS.LOW_ACCURACY).toBeDefined();
  });

  it("all messages are non-empty strings", () => {
    for (const msg of Object.values(GEO_ERRORS)) {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("LOW_ACCURACY message hướng dẫn bật Location accuracy", () => {
    expect(GEO_ERRORS.LOW_ACCURACY).toMatch(/[Ll]ocation accuracy|độ chính xác|GPS/);
  });
});

// ---------------------------------------------------------------------------
// classifyAccuracy — phân loại chất lượng GPS
// ---------------------------------------------------------------------------
// Dùng để phát hiện "Location accuracy = OFF" (Android) hoặc không SIM.
// Trong các mode đó accuracy thường 100–500m thay vì 5–20m.

describe("classifyAccuracy", () => {
  it("'good' khi accuracy <= 20m (GPS chip + A-GPS đầy đủ)", () => {
    expect(classifyAccuracy(5)).toBe("good");
    expect(classifyAccuracy(20)).toBe("good");
  });

  it("'acceptable' khi accuracy 21–100m (WiFi/cell assist yếu hoặc bán ngoài trời)", () => {
    expect(classifyAccuracy(21)).toBe("acceptable");
    expect(classifyAccuracy(100)).toBe("acceptable");
  });

  it("'poor' khi accuracy > 100m (GPS-only mode, trong nhà, hoặc Location accuracy = OFF)", () => {
    expect(classifyAccuracy(101)).toBe("poor");
    expect(classifyAccuracy(500)).toBe("poor");
    expect(classifyAccuracy(9999)).toBe("poor");
  });

  it("trả về string ở mọi giá trị hợp lệ", () => {
    for (const m of [1, 20, 21, 100, 101, 500]) {
      expect(typeof classifyAccuracy(m)).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// getCurrentPosition — accuracyThreshold option
// Khi "Location accuracy" = OFF hoặc không SIM, accuracy thường vượt 200m.
// Truyền accuracyThreshold để reject sớm thay vì lưu vị trí sai.
// ---------------------------------------------------------------------------

describe("getCurrentPosition — accuracyThreshold option", () => {
  function mockWithAccuracy(acc) {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        onLine: true,
        geolocation: {
          getCurrentPosition: (success) =>
            success({ coords: { latitude: 10, longitude: 106, accuracy: acc } }),
        },
      },
      writable: true,
    });
  }

  it("rejects với LOW_ACCURACY khi accuracy vượt threshold (Location accuracy = OFF)", async () => {
    mockWithAccuracy(600);
    await expect(getCurrentPosition({ accuracyThreshold: 300 })).rejects.toThrow(
      GEO_ERRORS.LOW_ACCURACY
    );
  });

  it("resolves bình thường khi accuracy nằm trong threshold", async () => {
    mockWithAccuracy(50);
    const pos = await getCurrentPosition({ accuracyThreshold: 100 });
    expect(pos.accuracy).toBe(50);
  });

  it("resolves bình thường khi accuracy bằng đúng threshold", async () => {
    mockWithAccuracy(100);
    const pos = await getCurrentPosition({ accuracyThreshold: 100 });
    expect(pos.accuracy).toBe(100);
  });

  it("không check threshold khi không truyền accuracyThreshold", async () => {
    mockWithAccuracy(9999);
    const pos = await getCurrentPosition();
    expect(pos.accuracy).toBe(9999);
  });

  it("kết quả trả về bao gồm accuracy để caller dùng classifyAccuracy", async () => {
    mockWithAccuracy(45);
    const pos = await getCurrentPosition();
    expect(pos).toHaveProperty("accuracy");
    expect(typeof pos.accuracy).toBe("number");
  });
});
