/**
 * TDD — checklistFrequency: chọn tần suất HIỆU LỰC cho 1 checklist.
 * Nguồn: override admin (localStorage) > mặc định catalog (checklists.js) > shift.
 * Phần resolve là thuần (nhận overrides tham số); phần load/set bọc localStorage.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_FREQUENCY_ID,
  resolveFrequencyId,
  loadFrequencyOverrides,
  setChecklistFrequency,
  getEffectiveFrequencyId,
} from "../checklistFrequency";

describe("resolveFrequencyId (thuần)", () => {
  it("override hợp lệ thắng mặc định catalog", () => {
    const cl = { id: "pump", frequency: "shift" };
    expect(resolveFrequencyId(cl, { pump: "8h" })).toBe("8h");
  });

  it("không có override → dùng mặc định catalog", () => {
    const cl = { id: "safety", frequency: "day" };
    expect(resolveFrequencyId(cl, {})).toBe("day");
  });

  it("override không hợp lệ → bỏ qua, dùng mặc định catalog", () => {
    const cl = { id: "pump", frequency: "4h" };
    expect(resolveFrequencyId(cl, { pump: "xyz" })).toBe("4h");
  });

  it("mặc định catalog không hợp lệ/thiếu → fallback shift", () => {
    expect(resolveFrequencyId({ id: "x" }, {})).toBe(DEFAULT_FREQUENCY_ID);
    expect(resolveFrequencyId({ id: "x", frequency: "sai" }, {})).toBe(DEFAULT_FREQUENCY_ID);
  });

  it("DEFAULT_FREQUENCY_ID là 'shift' (giữ hành vi cũ 1 lần/ca)", () => {
    expect(DEFAULT_FREQUENCY_ID).toBe("shift");
  });

  it("không crash khi checklist/overrides null", () => {
    expect(resolveFrequencyId(null, null)).toBe(DEFAULT_FREQUENCY_ID);
  });
});

describe("localStorage override (load/set)", () => {
  beforeEach(() => localStorage.clear());

  it("loadFrequencyOverrides trả {} khi chưa lưu", () => {
    expect(loadFrequencyOverrides()).toEqual({});
  });

  it("set rồi load lại đúng", () => {
    setChecklistFrequency("pump", "8h");
    expect(loadFrequencyOverrides()).toEqual({ pump: "8h" });
  });

  it("set nhiều checklist tích luỹ, ghi đè theo id", () => {
    setChecklistFrequency("pump", "8h");
    setChecklistFrequency("safety", "day");
    setChecklistFrequency("pump", "4h"); // ghi đè pump
    expect(loadFrequencyOverrides()).toEqual({ pump: "4h", safety: "day" });
  });

  it("set tần suất không hợp lệ → GỠ override (về mặc định catalog)", () => {
    setChecklistFrequency("pump", "8h");
    setChecklistFrequency("pump", "khong-co");
    expect(loadFrequencyOverrides()).toEqual({});
  });

  it("set rỗng → gỡ override của checklist đó", () => {
    setChecklistFrequency("pump", "8h");
    setChecklistFrequency("safety", "day");
    setChecklistFrequency("pump", "");
    expect(loadFrequencyOverrides()).toEqual({ safety: "day" });
  });

  it("không crash khi localStorage chứa JSON hỏng", () => {
    localStorage.setItem("qr_checklist_frequency", "{broken");
    expect(loadFrequencyOverrides()).toEqual({});
  });
});

describe("getEffectiveFrequencyId (đọc override từ localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("chưa set → dùng mặc định catalog", () => {
    expect(getEffectiveFrequencyId({ id: "safety", frequency: "day" })).toBe("day");
  });

  it("đã set override → dùng override", () => {
    setChecklistFrequency("safety", "month");
    expect(getEffectiveFrequencyId({ id: "safety", frequency: "day" })).toBe("month");
  });
});
