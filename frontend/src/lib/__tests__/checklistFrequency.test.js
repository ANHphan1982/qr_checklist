/**
 * TDD — checklistFrequency: chọn tần suất HIỆU LỰC cho 1 checklist.
 * Nguồn: override admin (localStorage) > mặc định catalog (checklists.js) > shift.
 * Phần resolve là thuần (nhận overrides tham số); phần load/set bọc localStorage.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_FREQUENCY_ID,
  resolveFrequencyId,
  resolveFrequencySetting,
  loadFrequencyOverrides,
  setChecklistFrequency,
  getEffectiveFrequencyId,
  getEffectiveFrequencySetting,
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

describe("month + ngày chốt trong tháng (monthDay)", () => {
  beforeEach(() => localStorage.clear());
  const cl = { id: "pump", frequency: "shift" };

  it("set 'month' kèm monthDay → lưu descriptor {id, monthDay}", () => {
    setChecklistFrequency("pump", "month", { monthDay: 15 });
    expect(loadFrequencyOverrides()).toEqual({ pump: { id: "month", monthDay: 15 } });
  });

  it("resolveFrequencyId với override descriptor → 'month' (tương thích chỗ cũ)", () => {
    expect(resolveFrequencyId(cl, { pump: { id: "month", monthDay: 15 } })).toBe("month");
  });

  it("resolveFrequencySetting → {id:'month', monthDay:15}", () => {
    const s = resolveFrequencySetting(cl, { pump: { id: "month", monthDay: 15 } });
    expect(s).toEqual({ id: "month", monthDay: 15 });
  });

  it("override chuỗi thường → setting chỉ có id, không monthDay", () => {
    expect(resolveFrequencySetting(cl, { pump: "8h" })).toEqual({ id: "8h" });
  });

  it("không override → setting theo mặc định catalog rồi shift", () => {
    expect(resolveFrequencySetting({ id: "safety", frequency: "day" }, {})).toEqual({ id: "day" });
    expect(resolveFrequencySetting({ id: "x" }, {})).toEqual({ id: DEFAULT_FREQUENCY_ID });
  });

  it("descriptor có id không hợp lệ → bỏ qua, về mặc định catalog", () => {
    const s = resolveFrequencySetting({ id: "pump", frequency: "4h" }, { pump: { id: "xyz", monthDay: 5 } });
    expect(s).toEqual({ id: "4h" });
  });

  it("descriptor month có monthDay không hợp lệ → giữ month, bỏ monthDay", () => {
    const s = resolveFrequencySetting(cl, { pump: { id: "month", monthDay: 99 } });
    expect(s).toEqual({ id: "month" });
  });

  it("set 'month' với monthDay không hợp lệ / =1 → lưu chuỗi 'month' thường", () => {
    setChecklistFrequency("pump", "month", { monthDay: 0 });
    expect(loadFrequencyOverrides()).toEqual({ pump: "month" });
    setChecklistFrequency("pump", "month", { monthDay: 1 });
    expect(loadFrequencyOverrides()).toEqual({ pump: "month" });
  });

  it("monthDay bị bỏ qua khi tần suất KHÔNG phải month", () => {
    setChecklistFrequency("pump", "8h", { monthDay: 15 });
    expect(loadFrequencyOverrides()).toEqual({ pump: "8h" });
  });

  it("set lại 'month' không kèm monthDay → về chuỗi thường (ngày 1)", () => {
    setChecklistFrequency("pump", "month", { monthDay: 15 });
    setChecklistFrequency("pump", "month");
    expect(loadFrequencyOverrides()).toEqual({ pump: "month" });
  });

  it("getEffectiveFrequencySetting đọc từ localStorage", () => {
    setChecklistFrequency("pump", "month", { monthDay: 15 });
    expect(getEffectiveFrequencySetting(cl)).toEqual({ id: "month", monthDay: 15 });
  });

  it("resolveFrequencyId các test cũ không đổi khi overrides chứa descriptor lẫn chuỗi", () => {
    const overrides = { pump: { id: "month", monthDay: 10 }, safety: "day" };
    expect(resolveFrequencyId({ id: "safety", frequency: "shift" }, overrides)).toBe("day");
    expect(resolveFrequencyId(cl, overrides)).toBe("month");
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
