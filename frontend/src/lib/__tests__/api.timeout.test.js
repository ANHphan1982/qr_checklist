/**
 * TDD — Solution B: postScan() phải dùng timeout ngắn (≤ 10s)
 *
 * Vấn đề: khi navigator.onLine=true nhưng không có internet thật (WiFi nội bộ),
 * postScan() timeout sau 90 giây → user thấy spinner quá lâu, nghĩ app chết,
 * thoát ra → modal nhập thông số không bao giờ hiện.
 *
 * Fix: postScan() dùng timeout riêng 8s thay vì 90s của axios instance.
 * pingServer() ở mount đã warm-up Render server, nên 8s đủ cho server đang chạy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => axiosInstance),
    get: vi.fn(),
  },
}));

const { postScan } = await import("../api.js");

beforeEach(() => {
  axiosInstance.post.mockReset();
  axiosInstance.get.mockReset();
});

describe("postScan() — timeout ngắn để offline path kịch hoạt nhanh", () => {
  it("RED → GREEN: postScan truyền timeout ≤ 10000ms trong per-request config", async () => {
    axiosInstance.post.mockResolvedValue({
      data: { status: "ok", scan_id: 1, location: "TK-5211A" },
    });

    await postScan("TK-5211A", "device-abc", null, null);

    const [, , config] = axiosInstance.post.mock.calls[0];
    // config phải tồn tại (per-request timeout override)
    expect(config).toBeDefined();
    expect(typeof config.timeout).toBe("number");
    // timeout phải đủ ngắn để offline path kịch hoạt — tối đa 10 giây
    expect(config.timeout).toBeLessThanOrEqual(10000);
    // timeout không được quá ngắn — cần ≥ 3s để tránh false positive trên mạng chậm
    expect(config.timeout).toBeGreaterThanOrEqual(3000);
  });

  it("timeout không ảnh hưởng đến payload — location và device_id vẫn đúng", async () => {
    axiosInstance.post.mockResolvedValue({
      data: { status: "ok", scan_id: 2, location: "PUMP_STATION_7" },
    });

    await postScan("PUMP_STATION_7", "device-xyz", null, "2026-05-13T10:00:00.000Z");

    const [url, payload] = axiosInstance.post.mock.calls[0];
    expect(url).toBe("/api/scan");
    expect(payload.location).toBe("PUMP_STATION_7");
    expect(payload.device_id).toBe("device-xyz");
    expect(payload.scanned_at).toBe("2026-05-13T10:00:00.000Z");
  });

  it("postScan với GPS data vẫn đính kèm lat/lng đúng", async () => {
    axiosInstance.post.mockResolvedValue({
      data: { status: "ok", scan_id: 3, location: "TK-5203A" },
    });

    const gpsData = { lat: 10.762622, lng: 106.660172, accuracy: 5.0 };
    await postScan("TK-5203A", "device-gps", gpsData, null);

    const [, payload, config] = axiosInstance.post.mock.calls[0];
    expect(payload.lat).toBe(10.762622);
    expect(payload.lng).toBe(106.660172);
    expect(payload.accuracy).toBe(5.0);
    // timeout vẫn phải ngắn dù có GPS
    expect(config?.timeout).toBeLessThanOrEqual(10000);
  });
});
