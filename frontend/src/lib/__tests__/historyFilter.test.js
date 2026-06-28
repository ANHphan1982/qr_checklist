import { describe, it, expect } from "vitest";
import { logHasBreach, summarizeLogs, filterLogs } from "../historyFilter";

const mk = (over) => ({
  id: 1, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z",
  geo_status: "ok", geo_distance: 30, email_sent: true, ...over,
});

const logs = [
  mk({ id: 1, location: "TK-5201A", geo_status: "ok" }),
  mk({ id: 2, location: "TK-5202B", geo_status: "out_of_range", geo_distance: 600 }),
  mk({ id: 3, location: "PUMP_6", geo_status: "no_gps", geo_distance: null }),
  mk({ id: 4, location: "TK-5203C", geo_status: "ok",
       param_values: [{ tag: "PG", label: "Seal", value: 0.9, unit: "bar", low: null, high: 0.5 }] }),
];

describe("logHasBreach", () => {
  it("true khi có param ngoài ngưỡng", () => {
    expect(logHasBreach(logs[3])).toBe(true);
  });
  it("false khi không có param_values", () => {
    expect(logHasBreach(logs[0])).toBe(false);
  });
  it("false khi param trong ngưỡng", () => {
    expect(logHasBreach(mk({ param_values: [{ value: 0.4, low: null, high: 0.5 }] }))).toBe(false);
  });
});

describe("summarizeLogs", () => {
  it("đếm tổng + từng loại", () => {
    const s = summarizeLogs(logs);
    expect(s.total).toBe(4);
    expect(s.ok).toBe(2);          // id1 + id4 (ok)
    expect(s.outOfRange).toBe(1);  // id2
    expect(s.noGps).toBe(1);       // id3
    expect(s.breach).toBe(1);      // id4
  });
  it("logs rỗng → mọi số 0", () => {
    expect(summarizeLogs([])).toEqual({ total: 0, ok: 0, outOfRange: 0, noGps: 0, breach: 0 });
  });
});

describe("filterLogs", () => {
  it("category 'all' trả tất cả", () => {
    expect(filterLogs(logs, { category: "all" })).toHaveLength(4);
  });
  it("category 'out_of_range' chỉ trạm ngoài phạm vi", () => {
    const r = filterLogs(logs, { category: "out_of_range" });
    expect(r.map((l) => l.id)).toEqual([2]);
  });
  it("category 'breach' chỉ log vượt ngưỡng", () => {
    const r = filterLogs(logs, { category: "breach" });
    expect(r.map((l) => l.id)).toEqual([4]);
  });
  it("category 'no_gps' chỉ log không GPS", () => {
    const r = filterLogs(logs, { category: "no_gps" });
    expect(r.map((l) => l.id)).toEqual([3]);
  });
  it("query lọc theo tên trạm (không phân biệt hoa thường)", () => {
    const r = filterLogs(logs, { category: "all", query: "tk-520" });
    expect(r.map((l) => l.id)).toEqual([1, 2, 4]);
  });
  it("kết hợp category + query", () => {
    const r = filterLogs(logs, { category: "ok", query: "tk" });
    expect(r.map((l) => l.id)).toEqual([1, 4]);
  });
  it("query rỗng/thiếu không lọc gì thêm", () => {
    expect(filterLogs(logs, { category: "all", query: "" })).toHaveLength(4);
    expect(filterLogs(logs, { category: "all" })).toHaveLength(4);
  });
});
