import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveEmployeeName, loadEmployeeName } from "../employeeName";

// ---------------------------------------------------------------------------
// employeeName — lưu/đọc tên nhân viên thực hiện checklist (localStorage) (TDD)
// Tên hiển thị trong header form báo cáo khi xuất Excel/email checklist.
// ---------------------------------------------------------------------------
describe("employeeName", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loadEmployeeName trả '' khi chưa lưu gì", () => {
    expect(loadEmployeeName()).toBe("");
  });

  it("save rồi load trả lại đúng tên", () => {
    saveEmployeeName("Nguyễn Văn A");
    expect(loadEmployeeName()).toBe("Nguyễn Văn A");
  });

  it("trim khoảng trắng thừa khi lưu", () => {
    saveEmployeeName("  Trần Thị B  ");
    expect(loadEmployeeName()).toBe("Trần Thị B");
  });

  it("lưu chuỗi rỗng/toàn khoảng trắng sẽ xóa tên đã lưu", () => {
    saveEmployeeName("Nguyễn Văn A");
    saveEmployeeName("   ");
    expect(loadEmployeeName()).toBe("");
  });

  it("load fail im lặng (trả '') khi localStorage lỗi", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(loadEmployeeName()).toBe("");
  });

  it("save fail im lặng khi localStorage lỗi", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveEmployeeName("X")).not.toThrow();
  });
});
