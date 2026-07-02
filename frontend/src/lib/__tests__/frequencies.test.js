/**
 * TDD — frequencies: danh mục tần suất ghi thông số + tính "chu kỳ" hiện tại
 * theo giờ VN (UTC+7). getPeriodAt trả cửa sổ [startMs, endMs) CÙNG shape với
 * getShiftAt (shifts.js) → computeCoverage dùng lại được không cần sửa.
 * Logic thuần, offset truyền tham số (mặc định +7) → không phụ thuộc TZ máy test.
 */
import { describe, it, expect } from "vitest";
import {
  FREQUENCIES,
  getFrequencyById,
  getPeriodAt,
  vnDatesInRange,
} from "../frequencies";

// Helper: instant UTC ứng với giờ VN (VN = UTC+7).
const utc = (s) => new Date(s + "Z");

describe("FREQUENCIES catalog", () => {
  it("là mảng không rỗng, mỗi mục có id + label", () => {
    expect(Array.isArray(FREQUENCIES)).toBe(true);
    expect(FREQUENCIES.length).toBeGreaterThan(0);
    for (const f of FREQUENCIES) {
      expect(f.id).toBeTruthy();
      expect(f.label).toBeTruthy();
    }
  });

  it("id là duy nhất", () => {
    const ids = FREQUENCIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("có đủ các tần suất chính: shift, 4h, 8h, day, month", () => {
    const ids = FREQUENCIES.map((f) => f.id);
    for (const id of ["shift", "4h", "8h", "day", "month"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("getFrequencyById", () => {
  it("trả đúng frequency theo id", () => {
    expect(getFrequencyById("8h").id).toBe("8h");
  });
  it("trả undefined khi id không tồn tại / rỗng", () => {
    expect(getFrequencyById("khong-co")).toBeUndefined();
    expect(getFrequencyById("")).toBeUndefined();
    expect(getFrequencyById(null)).toBeUndefined();
  });
});

describe("getPeriodAt — cửa sổ chu kỳ hiện tại (giờ VN)", () => {
  // Mốc test: VN 2026-06-22 10:00 = UTC 2026-06-22 03:00
  const at = utc("2026-06-22T03:00:00");

  it("shift → giống getShiftAt (ca ngày 06:00–18:00)", () => {
    const p = getPeriodAt("shift", at);
    expect(p.startMs).toBe(Date.parse("2026-06-21T23:00:00Z")); // VN 06:00
    expect(p.endMs).toBe(Date.parse("2026-06-22T11:00:00Z"));   // VN 18:00
  });

  it("day → ngày lịch VN 00:00–24:00", () => {
    const p = getPeriodAt("day", at);
    expect(p.startMs).toBe(Date.parse("2026-06-21T17:00:00Z")); // VN 2026-06-22 00:00
    expect(p.endMs).toBe(Date.parse("2026-06-22T17:00:00Z"));   // VN 2026-06-23 00:00
  });

  it("8h → cửa sổ 08:00–16:00 VN (căn theo nửa đêm)", () => {
    const p = getPeriodAt("8h", at);
    expect(p.startMs).toBe(Date.parse("2026-06-22T01:00:00Z")); // VN 08:00
    expect(p.endMs).toBe(Date.parse("2026-06-22T09:00:00Z"));   // VN 16:00
  });

  it("4h → cửa sổ 08:00–12:00 VN", () => {
    const p = getPeriodAt("4h", at);
    expect(p.startMs).toBe(Date.parse("2026-06-22T01:00:00Z")); // VN 08:00
    expect(p.endMs).toBe(Date.parse("2026-06-22T05:00:00Z"));   // VN 12:00
  });

  it("8h — đầu ngày VN 00:00 thuộc cửa sổ 00:00–08:00", () => {
    const p = getPeriodAt("8h", utc("2026-06-21T17:00:00")); // VN 2026-06-22 00:00
    expect(p.startMs).toBe(Date.parse("2026-06-21T17:00:00Z")); // VN 00:00
    expect(p.endMs).toBe(Date.parse("2026-06-22T01:00:00Z"));   // VN 08:00
  });

  it("month → tháng lịch VN, reset ngày 1", () => {
    const p = getPeriodAt("month", at);
    expect(p.startMs).toBe(Date.parse("2026-05-31T17:00:00Z")); // VN 2026-06-01 00:00
    expect(p.endMs).toBe(Date.parse("2026-06-30T17:00:00Z"));   // VN 2026-07-01 00:00
  });

  it("month — tháng 12 sang năm sau", () => {
    const p = getPeriodAt("month", utc("2026-12-15T03:00:00")); // VN 2026-12-15
    expect(p.startMs).toBe(Date.parse("2026-11-30T17:00:00Z")); // VN 2026-12-01 00:00
    expect(p.endMs).toBe(Date.parse("2026-12-31T17:00:00Z"));   // VN 2027-01-01 00:00
  });

  it("id không hợp lệ → fallback về shift (giữ hành vi cũ)", () => {
    const p = getPeriodAt("khong-co", at);
    const shift = getPeriodAt("shift", at);
    expect(p.startMs).toBe(shift.startMs);
    expect(p.endMs).toBe(shift.endMs);
  });

  it("cửa sổ luôn chứa mốc thời gian truyền vào (start ≤ t < end)", () => {
    for (const id of ["shift", "4h", "8h", "day", "month"]) {
      const p = getPeriodAt(id, at);
      expect(p.startMs).toBeLessThanOrEqual(at.getTime());
      expect(p.endMs).toBeGreaterThan(at.getTime());
    }
  });
});

describe("vnDatesInRange — liệt kê ngày VN cần tải report", () => {
  it("cùng ngày → 1 phần tử", () => {
    const start = Date.parse("2026-06-22T01:00:00Z"); // VN 08:00
    const end = Date.parse("2026-06-22T09:00:00Z");   // VN 16:00
    expect(vnDatesInRange(start, end)).toEqual(["2026-06-22"]);
  });

  it("khoảng vắt qua nửa đêm VN → gồm cả 2 ngày", () => {
    const start = Date.parse("2026-06-21T15:00:00Z"); // VN 2026-06-21 22:00
    const end = Date.parse("2026-06-22T03:00:00Z");   // VN 2026-06-22 10:00
    expect(vnDatesInRange(start, end)).toEqual(["2026-06-21", "2026-06-22"]);
  });

  it("khoảng 1 tháng → liệt kê đủ ngày đầu → cuối (VN)", () => {
    const start = Date.parse("2026-05-31T17:00:00Z"); // VN 2026-06-01 00:00
    const end = Date.parse("2026-06-03T03:00:00Z");   // VN 2026-06-03 10:00
    expect(vnDatesInRange(start, end)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });
});
