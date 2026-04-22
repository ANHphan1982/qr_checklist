/**
 * TDD — lib/api.js :: checkConnectivity()
 *
 * Covers: khi thiết bị đang ở chế độ máy bay (navigator.onLine === false),
 * không được báo "CORS hoặc server down" — phải nói thẳng là đang offline để
 * IT admin không đi sai hướng debug firewall/CORS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { checkConnectivity } = await import("../api.js");

function setOnline(value) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  axiosInstance.get.mockReset();
});

afterEach(() => {
  setOnline(true);
});

describe("checkConnectivity — offline (airplane mode)", () => {
  it("short-circuit khi navigator.onLine === false, không gọi HTTP", async () => {
    setOnline(false);

    const result = await checkConnectivity();

    expect(axiosInstance.get).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.detail.toLowerCase()).toMatch(/offline|máy bay|airplane/);
  });

  it("khi offline → trả offline: true để UI biết show WARN thay vì FAIL", async () => {
    setOnline(false);

    const result = await checkConnectivity();

    expect(result.offline).toBe(true);
  });

  it("vẫn gọi HTTP bình thường khi onLine === true", async () => {
    setOnline(true);
    axiosInstance.get.mockResolvedValue({
      data: { request_origin: "https://x.test", cors_origin_env: "*" },
    });

    const result = await checkConnectivity();

    expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.offline).toBeFalsy();
  });

  it("khi onLine === true và server không phản hồi → message cũ, offline=false", async () => {
    setOnline(true);
    const err = new Error("Network Error");
    err.response = undefined;
    axiosInstance.get.mockRejectedValue(err);

    const result = await checkConnectivity();

    expect(result.ok).toBe(false);
    expect(result.offline).toBeFalsy();
    expect(result.detail).toMatch(/CORS|server down|Không có phản hồi/);
  });
});
