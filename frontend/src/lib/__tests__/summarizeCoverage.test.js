import { describe, it, expect } from "vitest";
import { summarizeCoverage } from "../checklistCoverage";

describe("summarizeCoverage", () => {
  it("tổng hợp số trạm đã/thiếu trên nhiều checklist", () => {
    const map = {
      pump: { total: 3, missingCount: 1 },
      tank: { total: 2, missingCount: 0 },
    };
    const s = summarizeCoverage(map);
    expect(s.totalStations).toBe(5);
    expect(s.missingStations).toBe(1);
    expect(s.checkedStations).toBe(4);
  });

  it("allDone=true khi không còn trạm thiếu", () => {
    const map = { pump: { total: 2, missingCount: 0 } };
    expect(summarizeCoverage(map).allDone).toBe(true);
  });

  it("allDone=false khi còn trạm thiếu", () => {
    const map = { pump: { total: 2, missingCount: 1 } };
    expect(summarizeCoverage(map).allDone).toBe(false);
  });

  it("map rỗng → mọi số 0, hasData=false", () => {
    const s = summarizeCoverage({});
    expect(s.totalStations).toBe(0);
    expect(s.checkedStations).toBe(0);
    expect(s.missingStations).toBe(0);
    expect(s.hasData).toBe(false);
  });

  it("hasData=true khi có ít nhất 1 checklist gán trạm", () => {
    expect(summarizeCoverage({ pump: { total: 1, missingCount: 0 } }).hasData).toBe(true);
  });
});
