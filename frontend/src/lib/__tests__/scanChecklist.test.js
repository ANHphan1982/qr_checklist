import { describe, it, expect } from "vitest";
import { getShiftAt } from "../shifts";
import { buildScanChecklistInfo } from "../scanChecklist";

const utc = (s) => new Date(s + "Z");
const dayShift = getShiftAt(utc("2026-06-22T03:00:00")); // ca ngày 22/6 (VN 06–18)
const scanA = { location: "A", scanned_at: "2026-06-22T03:00:00Z" }; // trong ca

describe("buildScanChecklistInfo", () => {
  it("trả null khi type không tồn tại trong catalog", () => {
    expect(buildScanChecklistInfo("khong-co", {}, [], dayShift)).toBeNull();
  });

  it("checklist chưa gán trạm → hasAssignments=false, không có trạm thiếu", () => {
    const info = buildScanChecklistInfo("pump", {}, [], dayShift);
    expect(info.id).toBe("pump");
    expect(info.title).toBe("Pump Check List");
    expect(info.hasAssignments).toBe(false);
    expect(info.total).toBe(0);
    expect(info.missing).toEqual([]);
    expect(info.allDone).toBe(false);
  });

  it("có gán trạm + 1 trạm đã kiểm tra → tổng/đã/thiếu đúng", () => {
    const assignments = { pump: ["A", "B", "C"] };
    const info = buildScanChecklistInfo("pump", assignments, [scanA], dayShift);
    expect(info.hasAssignments).toBe(true);
    expect(info.total).toBe(3);
    expect(info.checkedCount).toBe(1);
    expect(info.missing).toEqual(["B", "C"]);
    expect(info.allDone).toBe(false);
  });

  it("mọi trạm đã kiểm tra → allDone=true, missing rỗng", () => {
    const assignments = { pump: ["A"] };
    const info = buildScanChecklistInfo("pump", assignments, [scanA], dayShift);
    expect(info.allDone).toBe(true);
    expect(info.missing).toEqual([]);
    expect(info.checkedCount).toBe(1);
  });

  it("scan ngoài ca không tính là đã kiểm tra", () => {
    const assignments = { pump: ["A"] };
    const outside = { location: "A", scanned_at: "2026-06-21T22:00:00Z" }; // ca đêm trước
    const info = buildScanChecklistInfo("pump", assignments, [outside], dayShift);
    expect(info.checkedCount).toBe(0);
    expect(info.missing).toEqual(["A"]);
  });
});
