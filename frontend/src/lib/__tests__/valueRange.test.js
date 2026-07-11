import { describe, it, expect } from "vitest";
import { isOutOfRange } from "../valueRange";

// isOutOfRange chuyển từ exportExcel.js sang module riêng không phụ thuộc xlsx —
// ScanHistory / historyFilter import từ đây để không kéo xlsx vào bundle chính.
describe("isOutOfRange (valueRange)", () => {
  it("trả false khi value null hoặc không có giới hạn", () => {
    expect(isOutOfRange(null, 10, 20)).toBe(false);
    expect(isOutOfRange(15, null, null)).toBe(false);
  });

  it("phát hiện vượt giới hạn dưới / trên", () => {
    expect(isOutOfRange(5, 10, 20)).toBe(true);
    expect(isOutOfRange(25, 10, 20)).toBe(true);
  });

  it("giá trị trong khoảng hoặc bằng đúng ngưỡng là OK", () => {
    expect(isOutOfRange(15, 10, 20)).toBe(false);
    expect(isOutOfRange(10, 10, 20)).toBe(false);
    expect(isOutOfRange(20, 10, 20)).toBe(false);
  });

  it("hoạt động khi chỉ cấu hình 1 ngưỡng", () => {
    expect(isOutOfRange(5, 10, null)).toBe(true);
    expect(isOutOfRange(25, null, 20)).toBe(true);
    expect(isOutOfRange(15, 10, null)).toBe(false);
  });
});
