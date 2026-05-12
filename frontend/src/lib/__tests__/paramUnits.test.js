/**
 * TDD — lib/paramUnits.js
 * Preset đơn vị cho dropdown "Đơn vị" trong StationParamsPanel
 */
import { describe, it, expect } from "vitest";
import { PARAM_UNIT_OPTIONS, isValidParamUnit } from "../paramUnits.js";

// ---------------------------------------------------------------------------
// PARAM_UNIT_OPTIONS — cấu trúc
// ---------------------------------------------------------------------------

describe("PARAM_UNIT_OPTIONS", () => {
  it("là một mảng", () => {
    expect(Array.isArray(PARAM_UNIT_OPTIONS)).toBe(true);
  });

  it("có ít nhất 5 lựa chọn", () => {
    expect(PARAM_UNIT_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it("mỗi phần tử có trường value (string không rỗng)", () => {
    PARAM_UNIT_OPTIONS.forEach(opt => {
      expect(typeof opt.value).toBe("string");
      expect(opt.value.length).toBeGreaterThan(0);
    });
  });

  it("mỗi phần tử có trường label (string không rỗng)", () => {
    PARAM_UNIT_OPTIONS.forEach(opt => {
      expect(typeof opt.label).toBe("string");
      expect(opt.label.length).toBeGreaterThan(0);
    });
  });

  it("tất cả value là duy nhất (không trùng lặp)", () => {
    const values = PARAM_UNIT_OPTIONS.map(o => o.value);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("không có label nào chứa ' — ' (không có mô tả dài)", () => {
    PARAM_UNIT_OPTIONS.forEach(opt => {
      expect(opt.label).not.toContain(" — ");
    });
  });
});

// ---------------------------------------------------------------------------
// Kiểm tra các đơn vị bắt buộc phải có
// ---------------------------------------------------------------------------

describe("PARAM_UNIT_OPTIONS — đơn vị bắt buộc", () => {
  const values = () => PARAM_UNIT_OPTIONS.map(o => o.value);

  it("chứa đơn vị 'mm' (tank level)", () => {
    expect(values()).toContain("mm");
  });

  it("chứa đơn vị 'kg/cm2g' (áp suất)", () => {
    expect(values()).toContain("kg/cm2g");
  });

  it("chứa đơn vị '%' (phần trăm)", () => {
    expect(values()).toContain("%");
  });

  it("chứa 'Yes' và 'No' là 2 lựa chọn riêng biệt", () => {
    expect(values()).toContain("Yes");
    expect(values()).toContain("No");
  });

  it("KHÔNG chứa 'Yes/No' gộp chung (đã tách thành 2 lựa chọn)", () => {
    expect(values()).not.toContain("Yes/No");
  });

  it("label của 'A' chỉ là 'A' (không có mô tả thêm)", () => {
    const aOpt = PARAM_UNIT_OPTIONS.find(o => o.value === "A");
    expect(aOpt).toBeDefined();
    expect(aOpt.label).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// isValidParamUnit — guard function
// ---------------------------------------------------------------------------

describe("isValidParamUnit", () => {
  it("trả về true cho value hợp lệ 'mm'", () => {
    expect(isValidParamUnit("mm")).toBe(true);
  });

  it("trả về true cho value hợp lệ 'kg/cm2g'", () => {
    expect(isValidParamUnit("kg/cm2g")).toBe(true);
  });

  it("trả về true cho value hợp lệ '%'", () => {
    expect(isValidParamUnit("%")).toBe(true);
  });

  it("trả về true cho 'Yes'", () => {
    expect(isValidParamUnit("Yes")).toBe(true);
  });

  it("trả về true cho 'No'", () => {
    expect(isValidParamUnit("No")).toBe(true);
  });

  it("trả về false cho 'Yes/No' gộp (không còn hợp lệ)", () => {
    expect(isValidParamUnit("Yes/No")).toBe(false);
  });

  it("trả về false cho giá trị không tồn tại", () => {
    expect(isValidParamUnit("xyz_invalid")).toBe(false);
  });

  it("trả về false cho string rỗng", () => {
    expect(isValidParamUnit("")).toBe(false);
  });

  it("trả về false cho null", () => {
    expect(isValidParamUnit(null)).toBe(false);
  });

  it("trả về false cho undefined", () => {
    expect(isValidParamUnit(undefined)).toBe(false);
  });
});
