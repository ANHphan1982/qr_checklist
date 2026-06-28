import { describe, it, expect, beforeEach } from "vitest";
import { saveRecentChecklist, loadRecentChecklist } from "../recentChecklist";

describe("recentChecklist", () => {
  beforeEach(() => localStorage.clear());

  it("loadRecentChecklist trả null khi chưa lưu", () => {
    expect(loadRecentChecklist()).toBeNull();
  });

  it("lưu rồi đọc lại đúng id", () => {
    saveRecentChecklist("pump");
    expect(loadRecentChecklist()).toBe("pump");
  });

  it("lưu lần sau ghi đè lần trước (mới nhất thắng)", () => {
    saveRecentChecklist("pump");
    saveRecentChecklist("tank");
    expect(loadRecentChecklist()).toBe("tank");
  });

  it("bỏ qua id rỗng/null (không ghi đè)", () => {
    saveRecentChecklist("pump");
    saveRecentChecklist("");
    saveRecentChecklist(null);
    expect(loadRecentChecklist()).toBe("pump");
  });

  it("không crash khi localStorage lỗi", () => {
    expect(() => saveRecentChecklist("x")).not.toThrow();
    expect(() => loadRecentChecklist()).not.toThrow();
  });
});
