/**
 * TDD — dateNav: chuyển ngày nhanh ◀ ▶ trên HistoryPage.
 * Thao tác chuỗi "YYYY-MM-DD" thuần — tránh lệch timezone.
 */
import { describe, it, expect } from "vitest";
import { addDays, canGoNext } from "../dateNav.js";

describe("addDays", () => {
  it("cộng/trừ ngày trong tháng", () => {
    expect(addDays("2026-06-12", -1)).toBe("2026-06-11");
    expect(addDays("2026-06-12", 1)).toBe("2026-06-13");
  });

  it("qua biên giới tháng", () => {
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("qua biên giới năm", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("năm nhuận: 2024-02-28 + 1 = 2024-02-29", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("năm thường: 2026-02-28 + 1 = 2026-03-01", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("canGoNext — không cho xem ngày tương lai", () => {
  it("false khi đang ở hôm nay", () => {
    expect(canGoNext("2026-06-12", "2026-06-12")).toBe(false);
  });

  it("true khi đang ở quá khứ", () => {
    expect(canGoNext("2026-06-11", "2026-06-12")).toBe(true);
    expect(canGoNext("2025-01-01", "2026-06-12")).toBe(true);
  });

  it("false khi date lỡ vượt hôm nay (phòng thủ)", () => {
    expect(canGoNext("2026-06-13", "2026-06-12")).toBe(false);
  });
});
