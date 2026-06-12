/**
 * TDD — haptics: rung phản hồi khi scan xong.
 * Công nhân ngoài trời nắng khó nhìn màn hình → rung là kênh phản hồi quan trọng.
 *
 * Convention:
 *   ok      → 2 nhịp ngắn  (thành công, dễ phân biệt)
 *   offline → 1 nhịp ngắn  (đã lưu, chưa xác nhận server)
 *   error   → 1 nhịp dài   (lỗi, cần nhìn màn hình)
 */
import { describe, it, expect, vi } from "vitest";
import { vibrationPatternFor, triggerVibration } from "../haptics.js";

describe("vibrationPatternFor — pattern theo trạng thái scan", () => {
  it("ok → 2 nhịp ngắn (mảng 3 phần tử: rung-nghỉ-rung)", () => {
    const p = vibrationPatternFor("ok");
    expect(p).toHaveLength(3);
    expect(p.every((ms) => ms > 0 && ms < 150)).toBe(true);
  });

  it("offline → 1 nhịp ngắn", () => {
    const p = vibrationPatternFor("offline");
    expect(p).toHaveLength(1);
    expect(p[0]).toBeLessThan(150);
  });

  it("error → 1 nhịp dài (>= 150ms)", () => {
    const p = vibrationPatternFor("error");
    expect(p).toHaveLength(1);
    expect(p[0]).toBeGreaterThanOrEqual(150);
  });

  it("3 trạng thái cho 3 pattern khác nhau", () => {
    const ok = JSON.stringify(vibrationPatternFor("ok"));
    const off = JSON.stringify(vibrationPatternFor("offline"));
    const err = JSON.stringify(vibrationPatternFor("error"));
    expect(ok).not.toBe(off);
    expect(ok).not.toBe(err);
    expect(off).not.toBe(err);
  });

  it("trạng thái không xác định → null (không rung)", () => {
    expect(vibrationPatternFor("whatever")).toBeNull();
    expect(vibrationPatternFor(null)).toBeNull();
    expect(vibrationPatternFor(undefined)).toBeNull();
  });
});

describe("triggerVibration — guard khi thiết bị không hỗ trợ", () => {
  it("gọi navigator.vibrate với đúng pattern", () => {
    const nav = { vibrate: vi.fn(() => true) };
    const result = triggerVibration("ok", nav);
    expect(result).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith(vibrationPatternFor("ok"));
  });

  it("trả false khi navigator không có vibrate (iOS Safari)", () => {
    expect(triggerVibration("ok", {})).toBe(false);
    expect(triggerVibration("ok", null)).toBe(false);
  });

  it("trả false và không gọi vibrate khi status không xác định", () => {
    const nav = { vibrate: vi.fn() };
    expect(triggerVibration("whatever", nav)).toBe(false);
    expect(nav.vibrate).not.toHaveBeenCalled();
  });

  it("không throw khi vibrate ném lỗi (permission policy)", () => {
    const nav = { vibrate: vi.fn(() => { throw new Error("blocked"); }) };
    expect(() => triggerVibration("ok", nav)).not.toThrow();
    expect(triggerVibration("ok", nav)).toBe(false);
  });
});
