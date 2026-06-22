/**
 * TDD — checklistCoverage: với danh sách trạm của 1 checklist + scan logs,
 * tính xem trong CA hiện tại trạm nào đã/chưa kiểm tra (≥1 lần/ca) + dựng
 * dòng Excel để tra cứu.
 */
import { describe, it, expect } from "vitest";
import { getShiftAt } from "../shifts";
import { computeCoverage, buildChecklistShiftRows } from "../checklistCoverage";

const utc = (s) => new Date(s + "Z");
const dayShift = getShiftAt(utc("2026-06-22T03:00:00")); // ca ngày 22/6 (VN 06–18)

// scan trong ca ngày (VN 10:00) cho trạm A
const scanA = { location: "A", scanned_at: "2026-06-22T03:00:00Z" };
// scan NGOÀI ca (VN 05:00 — ca đêm trước) cho trạm B
const scanBoutside = { location: "B", scanned_at: "2026-06-21T22:00:00Z" };

describe("computeCoverage", () => {
  it("phân loại trạm đã kiểm tra vs còn thiếu trong ca", () => {
    const cov = computeCoverage(["A", "B", "C"], [scanA], dayShift);
    expect(cov.total).toBe(3);
    expect(cov.checked).toEqual(["A"]);
    expect(cov.missing).toEqual(["B", "C"]);
    expect(cov.missingCount).toBe(2);
    expect(cov.ok).toBe(false);
  });

  it("ok=true khi mọi trạm đã kiểm tra", () => {
    const cov = computeCoverage(["A"], [scanA], dayShift);
    expect(cov.ok).toBe(true);
    expect(cov.missing).toEqual([]);
  });

  it("scan ngoài cửa sổ ca KHÔNG tính là đã kiểm tra", () => {
    const cov = computeCoverage(["B"], [scanBoutside], dayShift);
    expect(cov.checked).toEqual([]);
    expect(cov.missing).toEqual(["B"]);
  });

  it("checklist rỗng (chưa gán trạm) → ok=true, không cảnh báo", () => {
    const cov = computeCoverage([], [scanA], dayShift);
    expect(cov.total).toBe(0);
    expect(cov.ok).toBe(true);
    expect(cov.missingCount).toBe(0);
  });

  it("nhiều scan cùng trạm vẫn chỉ tính 1 lần", () => {
    const scans = [scanA, { location: "A", scanned_at: "2026-06-22T04:00:00Z" }];
    const cov = computeCoverage(["A"], scans, dayShift);
    expect(cov.checked).toEqual(["A"]);
  });
});

describe("buildChecklistShiftRows", () => {
  it("mỗi trạm 1 dòng với trạng thái + ca", () => {
    const rows = buildChecklistShiftRows(["A", "B"], [scanA], dayShift);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Trạm"]).toBe("A");
    expect(rows[0]["Trạng thái"]).toContain("Đã kiểm tra");
    expect(rows[0]["Lần kiểm tra gần nhất"]).not.toBe(""); // có thời gian
    expect(rows[1]["Trạm"]).toBe("B");
    expect(rows[1]["Trạng thái"]).toContain("Chưa kiểm tra");
    expect(rows[1]["Lần kiểm tra gần nhất"]).toBe("");
    expect(rows[0]["Ca"]).toBe(dayShift.label);
  });

  it("lấy lần kiểm tra MỚI NHẤT khi có nhiều scan trong ca", () => {
    const scans = [
      { location: "A", scanned_at: "2026-06-22T03:00:00Z" },
      { location: "A", scanned_at: "2026-06-22T05:00:00Z" }, // muộn hơn
    ];
    const rows = buildChecklistShiftRows(["A"], scans, dayShift);
    // 05:00Z = VN 12:00 → chuỗi giờ phải chứa "12:"
    expect(rows[0]["Lần kiểm tra gần nhất"]).toContain("12:");
  });
});
