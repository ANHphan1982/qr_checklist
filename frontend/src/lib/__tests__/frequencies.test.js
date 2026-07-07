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
  sanitizeMonthDay,
  frequencyShortLabel,
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

describe("sanitizeMonthDay — chuẩn hoá ngày chốt trong tháng", () => {
  it("số nguyên 1..31 → giữ nguyên", () => {
    expect(sanitizeMonthDay(1)).toBe(1);
    expect(sanitizeMonthDay(15)).toBe(15);
    expect(sanitizeMonthDay(31)).toBe(31);
  });

  it("chuỗi số hợp lệ → ép về số (giá trị từ <select>)", () => {
    expect(sanitizeMonthDay("15")).toBe(15);
  });

  it("ngoài 1..31 / không phải số / rỗng → undefined", () => {
    expect(sanitizeMonthDay(0)).toBeUndefined();
    expect(sanitizeMonthDay(32)).toBeUndefined();
    expect(sanitizeMonthDay(15.5)).toBeUndefined();
    expect(sanitizeMonthDay("abc")).toBeUndefined();
    expect(sanitizeMonthDay(null)).toBeUndefined();
    expect(sanitizeMonthDay(undefined)).toBeUndefined();
  });
});

describe("getPeriodAt — month có ngày chốt (monthDay)", () => {
  // Mốc test: VN 2026-06-22 10:00 = UTC 2026-06-22 03:00
  const at = utc("2026-06-22T03:00:00");

  it("monthDay 15, sau ngày chốt → kỳ [15/06, 15/07) VN", () => {
    const p = getPeriodAt({ id: "month", monthDay: 15 }, at);
    expect(p.startMs).toBe(Date.parse("2026-06-14T17:00:00Z")); // VN 15/06 00:00
    expect(p.endMs).toBe(Date.parse("2026-07-14T17:00:00Z"));   // VN 15/07 00:00
  });

  it("monthDay 15, TRƯỚC ngày chốt → kỳ [15/05, 15/06) VN", () => {
    const before = utc("2026-06-10T03:00:00"); // VN 10/06 10:00
    const p = getPeriodAt({ id: "month", monthDay: 15 }, before);
    expect(p.startMs).toBe(Date.parse("2026-05-14T17:00:00Z")); // VN 15/05 00:00
    expect(p.endMs).toBe(Date.parse("2026-06-14T17:00:00Z"));   // VN 15/06 00:00
  });

  it("tháng thiếu ngày chốt → kẹp về ngày cuối tháng (31 → 30/04)", () => {
    const apr = utc("2026-04-20T03:00:00"); // VN 20/04 10:00
    const p = getPeriodAt({ id: "month", monthDay: 31 }, apr);
    expect(p.startMs).toBe(Date.parse("2026-03-30T17:00:00Z")); // VN 31/03 00:00
    expect(p.endMs).toBe(Date.parse("2026-04-29T17:00:00Z"));   // VN 30/04 00:00
  });

  it("tháng 2 không nhuận: monthDay 30 → kẹp 28/02", () => {
    const feb = utc("2026-02-10T03:00:00"); // VN 10/02 10:00
    const p = getPeriodAt({ id: "month", monthDay: 30 }, feb);
    expect(p.startMs).toBe(Date.parse("2026-01-29T17:00:00Z")); // VN 30/01 00:00
    expect(p.endMs).toBe(Date.parse("2026-02-27T17:00:00Z"));   // VN 28/02 00:00
  });

  it("đúng ngày chốt (đã kẹp) → mở kỳ mới từ hôm đó", () => {
    const on = utc("2026-04-30T03:00:00"); // VN 30/04 10:00, monthDay 31 kẹp = 30/04
    const p = getPeriodAt({ id: "month", monthDay: 31 }, on);
    expect(p.startMs).toBe(Date.parse("2026-04-29T17:00:00Z")); // VN 30/04 00:00
    expect(p.endMs).toBe(Date.parse("2026-05-30T17:00:00Z"));   // VN 31/05 00:00
  });

  it("kỳ vắt qua năm mới: monthDay 15, đầu tháng 1 → [15/12 năm trước, 15/01)", () => {
    const jan = utc("2026-01-05T03:00:00"); // VN 05/01 10:00
    const p = getPeriodAt({ id: "month", monthDay: 15 }, jan);
    expect(p.startMs).toBe(Date.parse("2025-12-14T17:00:00Z")); // VN 15/12/2025 00:00
    expect(p.endMs).toBe(Date.parse("2026-01-14T17:00:00Z"));   // VN 15/01/2026 00:00
  });

  it("monthDay 1 / thiếu / không hợp lệ → giống 'month' chuỗi (reset ngày 1)", () => {
    const plain = getPeriodAt("month", at);
    for (const monthDay of [1, undefined, 0, 32, "abc"]) {
      const p = getPeriodAt({ id: "month", monthDay }, at);
      expect(p.startMs).toBe(plain.startMs);
      expect(p.endMs).toBe(plain.endMs);
      expect(p.label).toBe(plain.label);
    }
  });

  it("descriptor cho tần suất KHÔNG phải month → monthDay bị bỏ qua", () => {
    const plain = getPeriodAt("day", at);
    const p = getPeriodAt({ id: "day", monthDay: 15 }, at);
    expect(p.startMs).toBe(plain.startMs);
    expect(p.endMs).toBe(plain.endMs);
  });

  it("label kỳ có ngày chốt nêu rõ ngày bắt đầu (15/06)", () => {
    const p = getPeriodAt({ id: "month", monthDay: 15 }, at);
    expect(p.label).toContain("15/06");
  });

  it("cửa sổ luôn chứa mốc thời gian truyền vào với mọi monthDay", () => {
    for (const monthDay of [1, 5, 15, 28, 31]) {
      for (const when of [at, utc("2026-02-01T03:00:00"), utc("2026-12-31T15:00:00")]) {
        const p = getPeriodAt({ id: "month", monthDay }, when);
        expect(p.startMs).toBeLessThanOrEqual(when.getTime());
        expect(p.endMs).toBeGreaterThan(when.getTime());
      }
    }
  });
});

describe("frequencyShortLabel — nhãn ngắn theo setting", () => {
  it("setting thường → short từ catalog", () => {
    expect(frequencyShortLabel({ id: "8h" })).toBe("8h/lần");
    expect(frequencyShortLabel({ id: "shift" })).toBe("1 lần/ca");
  });

  it("month có ngày chốt → kèm '(ngày N)'", () => {
    expect(frequencyShortLabel({ id: "month", monthDay: 15 })).toBe("1 lần/tháng (ngày 15)");
  });

  it("month không có / ngày 1 / monthDay không hợp lệ → nhãn gốc", () => {
    expect(frequencyShortLabel({ id: "month" })).toBe("1 lần/tháng");
    expect(frequencyShortLabel({ id: "month", monthDay: 1 })).toBe("1 lần/tháng");
    expect(frequencyShortLabel({ id: "month", monthDay: 99 })).toBe("1 lần/tháng");
  });

  it("id không tồn tại / setting rỗng → undefined", () => {
    expect(frequencyShortLabel({ id: "xyz" })).toBeUndefined();
    expect(frequencyShortLabel(null)).toBeUndefined();
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
