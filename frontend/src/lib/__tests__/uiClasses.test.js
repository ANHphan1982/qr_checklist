/**
 * TDD — uiClasses: class builder cho UI primitives (Button).
 * Gom các chuỗi Tailwind lặp lại khắp nơi về 1 chỗ.
 */
import { describe, it, expect } from "vitest";
import { buttonClasses, BUTTON_VARIANTS, BUTTON_SIZES } from "../uiClasses.js";

describe("buttonClasses — variants", () => {
  it("có đủ 5 variant: primary, secondary, danger, outline, success", () => {
    for (const v of ["primary", "secondary", "danger", "outline", "success"]) {
      expect(BUTTON_VARIANTS).toHaveProperty(v);
    }
  });

  it("các variant cho class khác nhau", () => {
    const all = ["primary", "secondary", "danger", "outline", "success"]
      .map((v) => buttonClasses(v, "md"));
    expect(new Set(all).size).toBe(5);
  });

  it("variant không xác định fallback về primary", () => {
    expect(buttonClasses("whatever", "md")).toBe(buttonClasses("primary", "md"));
  });

  it("primary nền xanh, danger nền/chữ đỏ", () => {
    expect(buttonClasses("primary", "md")).toContain("bg-blue-600");
    expect(buttonClasses("danger", "md")).toMatch(/red/);
  });
});

describe("buttonClasses — sizes", () => {
  it("có đủ 3 size: sm, md, xl", () => {
    for (const s of ["sm", "md", "xl"]) {
      expect(BUTTON_SIZES).toHaveProperty(s);
    }
  });

  it("mọi size đều có touch target tối thiểu 44px", () => {
    for (const s of ["sm", "md", "xl"]) {
      expect(buttonClasses("primary", s)).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    }
  });

  it("size không xác định fallback về md", () => {
    expect(buttonClasses("primary", "whatever")).toBe(buttonClasses("primary", "md"));
  });

  it("base class luôn có: rounded, transition, flex căn giữa", () => {
    const c = buttonClasses("secondary", "sm");
    expect(c).toContain("rounded");
    expect(c).toContain("transition-colors");
    expect(c).toContain("items-center");
    expect(c).toContain("justify-center");
  });
});
