/**
 * TDD (integration) — tần suất ĐIỀU KHIỂN cửa sổ coverage.
 * getPeriodAt(frequency) trả period, computeCoverage nhận period đó → cùng một
 * lượt scan có thể "đủ" với tần suất này nhưng "chưa" với tần suất khác.
 * Đây là hành vi cốt lõi người dùng yêu cầu (pump=mỗi ca, safety=mỗi ngày...).
 */
import { describe, it, expect } from "vitest";
import { getPeriodAt } from "../frequencies";
import { computeCoverage } from "../checklistCoverage";

const utc = (s) => new Date(s + "Z");

describe("tần suất điều khiển coverage", () => {
  const stations = ["A", "B"];
  // "Bây giờ": VN 2026-06-22 10:00 = UTC 03:00
  const now = utc("2026-06-22T03:00:00");

  // Scan A lúc VN 07:00 (UTC 00:00) — cùng ngày, nhưng thuộc cửa sổ 8h TRƯỚC
  // (00:00–08:00) so với "bây giờ" (08:00–16:00).
  const scans = [{ location: "A", scanned_at: "2026-06-22T00:00:00Z" }];

  it("tần suất 'day' → scan cùng ngày tính là đã kiểm tra", () => {
    const period = getPeriodAt("day", now);
    const cov = computeCoverage(stations, scans, period);
    expect(cov.checked).toEqual(["A"]);
    expect(cov.missing).toEqual(["B"]);
  });

  it("tần suất '8h' → scan ở cửa sổ 8h trước KHÔNG tính cho cửa sổ hiện tại", () => {
    const period = getPeriodAt("8h", now);
    const cov = computeCoverage(stations, scans, period);
    // A quét lúc 07:00 (cửa sổ 00–08), không thuộc cửa sổ 08–16 hiện tại.
    expect(cov.checked).toEqual([]);
    expect(cov.missingCount).toBe(2);
  });

  it("tần suất 'shift' (mặc định) giữ hành vi cũ: scan trong ca ngày → đã kiểm tra", () => {
    const period = getPeriodAt("shift", now); // ca ngày 06:00–18:00
    const cov = computeCoverage(stations, scans, period);
    expect(cov.checked).toEqual(["A"]); // 07:00 nằm trong ca ngày
  });

  it("month + ngày chốt 15: scan SAU ngày chốt tính cho kỳ hiện tại", () => {
    // Kỳ hiện tại (now = 22/06): [15/06, 15/07) VN. Scan 20/06 → đã kiểm tra.
    const period = getPeriodAt({ id: "month", monthDay: 15 }, now);
    const cov = computeCoverage(
      stations,
      [{ location: "A", scanned_at: "2026-06-20T00:00:00Z" }],
      period
    );
    expect(cov.checked).toEqual(["A"]);
    expect(cov.missing).toEqual(["B"]);
  });

  it("month + ngày chốt 15: scan TRƯỚC ngày chốt thuộc kỳ trước, KHÔNG tính", () => {
    // Scan 10/06 nằm trong kỳ [15/05, 15/06) → kỳ hiện tại vẫn thiếu cả 2 trạm.
    const period = getPeriodAt({ id: "month", monthDay: 15 }, now);
    const cov = computeCoverage(
      stations,
      [{ location: "A", scanned_at: "2026-06-10T00:00:00Z" }],
      period
    );
    expect(cov.checked).toEqual([]);
    expect(cov.missingCount).toBe(2);
  });
});
