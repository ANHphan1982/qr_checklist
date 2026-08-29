import { describe, it, expect } from "vitest";
import {
  buildCachedGpsData,
  createGpsSkipHandle,
  GPS_SKIPPED,
  GPS_SLOW_HINT_MS,
} from "../gpsFallback.js";

describe("buildCachedGpsData", () => {
  it("dựng payload kèm cờ cached + tuổi cache", () => {
    const now = 1_000_000;
    const out = buildCachedGpsData({ lat: 10.5, lng: 107.2, accuracy: 25, ts: now - 60_000 }, now);
    expect(out).toEqual({
      lat: 10.5,
      lng: 107.2,
      accuracy: 25,
      cached: true,
      cache_age_ms: 60_000,
    });
  });

  it("cache null / thiếu tọa độ → null", () => {
    expect(buildCachedGpsData(null)).toBeNull();
    expect(buildCachedGpsData({})).toBeNull();
    expect(buildCachedGpsData({ lat: 10 })).toBeNull();
    expect(buildCachedGpsData({ lat: "10", lng: "107" })).toBeNull();
  });

  it("thiếu ts → vẫn dùng được, cache_age_ms undefined", () => {
    const out = buildCachedGpsData({ lat: 1, lng: 2, accuracy: 5 }, 1000);
    expect(out.cached).toBe(true);
    expect(out.cache_age_ms).toBeUndefined();
  });

  it("lat/lng = 0 vẫn hợp lệ (không bị falsy loại nhầm)", () => {
    expect(buildCachedGpsData({ lat: 0, lng: 0, ts: 1 }, 2)).not.toBeNull();
  });
});

describe("createGpsSkipHandle", () => {
  it("promise chỉ resolve sau khi gọi skip(), trả sentinel", async () => {
    const { promise, skip } = createGpsSkipHandle();
    let settled = false;
    promise.then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);

    skip();
    await expect(promise).resolves.toBe(GPS_SKIPPED);
  });

  it("thắng race khi nguồn kia còn treo", async () => {
    const { promise, skip } = createGpsSkipHandle();
    const never = new Promise(() => {});
    skip();
    await expect(Promise.race([never, promise])).resolves.toBe(GPS_SKIPPED);
  });

  it("gọi skip nhiều lần không lỗi", async () => {
    const { promise, skip } = createGpsSkipHandle();
    skip(); skip();
    await expect(promise).resolves.toBe(GPS_SKIPPED);
  });
});

describe("GPS_SLOW_HINT_MS", () => {
  it("ngắn hơn nhiều so với timeout offline 90s để user không kẹt", () => {
    expect(GPS_SLOW_HINT_MS).toBeGreaterThan(0);
    expect(GPS_SLOW_HINT_MS).toBeLessThan(90_000);
  });
});
