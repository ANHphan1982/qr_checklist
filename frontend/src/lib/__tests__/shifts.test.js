/**
 * TDD — shifts: chia ngày thành 2 ca theo giờ VN (UTC+7).
 *   Ca ngày  (day):   06:00 → 18:00
 *   Ca đêm   (night):  18:00 → 06:00 hôm sau (vắt qua nửa đêm)
 * Logic thuần, không phụ thuộc timezone máy chạy test (offset truyền tham số, mặc định +7).
 */
import { describe, it, expect } from "vitest";
import { getShiftAt, isWithinShift, SHIFT_DAY, SHIFT_NIGHT } from "../shifts";

// Helper: instant UTC tương ứng giờ VN (VN = UTC+7).
const utc = (s) => new Date(s + "Z");

describe("getShiftAt — xác định ca theo giờ VN", () => {
  it("VN 10:00 → ca ngày, cửa sổ 06:00–18:00 cùng ngày", () => {
    const sh = getShiftAt(utc("2026-06-22T03:00:00")); // VN 10:00
    expect(sh.id).toBe(SHIFT_DAY);
    expect(sh.startMs).toBe(Date.parse("2026-06-21T23:00:00Z")); // VN 06:00
    expect(sh.endMs).toBe(Date.parse("2026-06-22T11:00:00Z"));   // VN 18:00
  });

  it("VN 20:00 → ca đêm, 18:00 hôm nay → 06:00 hôm sau", () => {
    const sh = getShiftAt(utc("2026-06-22T13:00:00")); // VN 20:00
    expect(sh.id).toBe(SHIFT_NIGHT);
    expect(sh.startMs).toBe(Date.parse("2026-06-22T11:00:00Z")); // VN 18:00 hôm nay
    expect(sh.endMs).toBe(Date.parse("2026-06-22T23:00:00Z"));   // VN 06:00 hôm sau
  });

  it("VN 03:00 (rạng sáng) → ca đêm bắt đầu 18:00 hôm trước", () => {
    const sh = getShiftAt(utc("2026-06-21T20:00:00")); // VN 2026-06-22 03:00
    expect(sh.id).toBe(SHIFT_NIGHT);
    expect(sh.startMs).toBe(Date.parse("2026-06-21T11:00:00Z")); // VN 2026-06-21 18:00
    expect(sh.endMs).toBe(Date.parse("2026-06-21T23:00:00Z"));   // VN 2026-06-22 06:00
  });

  it("biên 06:00 thuộc ca ngày; biên 18:00 thuộc ca đêm", () => {
    expect(getShiftAt(utc("2026-06-21T23:00:00")).id).toBe(SHIFT_DAY);  // VN 06:00
    expect(getShiftAt(utc("2026-06-22T11:00:00")).id).toBe(SHIFT_NIGHT); // VN 18:00
  });
});

describe("isWithinShift", () => {
  const dayShift = getShiftAt(utc("2026-06-22T03:00:00")); // ca ngày 22/6

  it("scan VN 10:00 nằm trong ca ngày", () => {
    expect(isWithinShift(utc("2026-06-22T03:00:00"), dayShift)).toBe(true);
  });

  it("scan VN 05:00 KHÔNG nằm trong ca ngày (thuộc ca đêm trước)", () => {
    expect(isWithinShift(utc("2026-06-21T22:00:00"), dayShift)).toBe(false);
  });

  it("đầu ca (đúng 06:00) tính là trong ca; cuối ca (đúng 18:00) thì không", () => {
    expect(isWithinShift(utc("2026-06-21T23:00:00"), dayShift)).toBe(true);  // 06:00
    expect(isWithinShift(utc("2026-06-22T11:00:00"), dayShift)).toBe(false); // 18:00 (end, loại trừ)
  });
});
