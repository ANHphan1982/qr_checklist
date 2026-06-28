/**
 * TDD — checklistCoverage: với danh sách trạm của 1 checklist + scan logs,
 * tính xem trong CA hiện tại trạm nào đã/chưa kiểm tra (≥1 lần/ca) + dựng
 * dòng Excel để tra cứu.
 */
import { describe, it, expect } from "vitest";
import { getShiftAt } from "../shifts";
import {
  computeCoverage,
  buildChecklistShiftRows,
  selectChecklistShiftLogs,
  checklistCardCounts,
} from "../checklistCoverage";
import { buildHistoryRows } from "../exportExcel";

const utc = (s) => new Date(s + "Z");
const dayShift = getShiftAt(utc("2026-06-22T03:00:00")); // ca ngày 22/6 (VN 06–18)

// scan trong ca ngày (VN 10:00) cho trạm A
const scanA = { location: "A", scanned_at: "2026-06-22T03:00:00Z" };
// scan NGOÀI ca (VN 05:00 — ca đêm trước) cho trạm B
const scanBoutside = { location: "B", scanned_at: "2026-06-21T22:00:00Z" };

describe("checklistCardCounts — số hiển thị trên thẻ checklist", () => {
  it("dùng coverage thật (checked/total) khi có cov — KHỚP với dòng cảnh báo", () => {
    // Pump: 13 trạm gán thật, mới kiểm tra 0 → thẻ phải hiện 0/13, không phải 2/6
    const cov = computeCoverage(["A", "B", "C"], [scanA], dayShift); // checked=1, total=3
    expect(checklistCardCounts(cov, 6)).toEqual({ checked: 1, total: 3 });
  });

  it("checked = total - missingCount", () => {
    const cov = computeCoverage(["A", "B", "C"], [], dayShift); // checked=0, total=3
    expect(checklistCardCounts(cov, 6)).toEqual({ checked: 0, total: 3 });
  });

  it("dùng fallbackTotal và checked=0 khi chưa có coverage (chưa gán trạm)", () => {
    expect(checklistCardCounts(undefined, 6)).toEqual({ checked: 0, total: 6 });
  });

  it("fallbackTotal mặc định 0 khi không truyền", () => {
    expect(checklistCardCounts(null)).toEqual({ checked: 0, total: 0 });
  });
});

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

// ---------------------------------------------------------------------------
// selectChecklistShiftLogs — lọc scan logs thuộc checklist + trong ca, để xuất
// Excel cùng cấu trúc với trang Lịch sử (full 16 cột qua buildHistoryRows).
// ---------------------------------------------------------------------------
describe("selectChecklistShiftLogs", () => {
  const logA1 = { id: 1, location: "A", scanned_at: "2026-06-22T05:00:00Z", device_id: "d", geo_status: "ok" };
  const logA2 = { id: 2, location: "A", scanned_at: "2026-06-22T03:00:00Z", device_id: "d", geo_status: "ok" };
  const logB  = { id: 3, location: "B", scanned_at: "2026-06-22T04:00:00Z", device_id: "d", geo_status: "ok" };
  const logC  = { id: 4, location: "C", scanned_at: "2026-06-22T04:00:00Z", device_id: "d", geo_status: "ok" }; // ngoài checklist
  const logBout = { id: 5, location: "B", scanned_at: "2026-06-21T22:00:00Z", device_id: "d", geo_status: "ok" }; // ngoài ca

  it("chỉ giữ scan của trạm thuộc checklist", () => {
    const out = selectChecklistShiftLogs(["A", "B"], [logA1, logB, logC], dayShift);
    expect(out.map((l) => l.id)).toEqual(expect.arrayContaining([1, 3]));
    expect(out.find((l) => l.id === 4)).toBeUndefined();
  });

  it("loại scan ngoài cửa sổ ca", () => {
    const out = selectChecklistShiftLogs(["B"], [logB, logBout], dayShift);
    expect(out.map((l) => l.id)).toEqual([3]);
  });

  it("sắp xếp theo thời gian tăng dần", () => {
    const out = selectChecklistShiftLogs(["A"], [logA1, logA2], dayShift);
    expect(out.map((l) => l.id)).toEqual([2, 1]); // 03:00 trước 05:00
  });

  it("giữ NGUYÊN mọi scan trong ca (không gộp về 1 lần/trạm như coverage)", () => {
    const out = selectChecklistShiftLogs(["A"], [logA1, logA2], dayShift);
    expect(out).toHaveLength(2);
  });

  it("trả mảng rỗng khi không có scan khớp", () => {
    expect(selectChecklistShiftLogs(["Z"], [logA1], dayShift)).toEqual([]);
  });

  it("kết quả đưa qua buildHistoryRows cho cấu trúc đầy đủ giống History", () => {
    const out = selectChecklistShiftLogs(["A"], [logA1], dayShift);
    const [row] = buildHistoryRows(out, {});
    for (const col of [
      "ID", "Trạm", "Thời gian (VN)", "GPS", "Khoảng cách (m)",
      "Khoảng cách từ trạm trước (m)", "Thời gian dự kiến (phút)",
      "Thời gian thực tế (phút)", "Đánh giá tốc độ", "Mã thiết bị",
      "Tên thông số", "Giá trị", "Đơn vị", "Giới hạn dưới",
      "Giới hạn trên", "Cảnh báo",
    ]) {
      expect(row).toHaveProperty(col);
    }
  });
});
