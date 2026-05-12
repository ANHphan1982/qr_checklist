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

  it("chứa đơn vị 'Yes/No' (trạng thái)", () => {
    expect(values()).toContain("Yes/No");
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
