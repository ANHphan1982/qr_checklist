/**
 * TDD — checklistStations: map "checklist ↔ trạm" lưu localStorage.
 * Logic thuần (load/save/toggle/isAssigned/getStationsFor) — UI panel dùng lại.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadAssignments,
  saveAssignments,
  getStationsFor,
  isAssigned,
  toggleStation,
  STORAGE_KEY,
} from "../checklistStations";

beforeEach(() => localStorage.clear());

describe("checklistStations", () => {
  it("loadAssignments trả {} khi chưa lưu gì", () => {
    expect(loadAssignments()).toEqual({});
  });

  it("loadAssignments trả {} khi localStorage hỏng (JSON lỗi)", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    expect(loadAssignments()).toEqual({});
  });

  it("loadAssignments trả {} khi JSON hợp lệ nhưng không phải object", () => {
    localStorage.setItem(STORAGE_KEY, "123");
    expect(loadAssignments()).toEqual({});
    localStorage.setItem(STORAGE_KEY, "null");
    expect(loadAssignments()).toEqual({});
  });

  it("save → load round-trip", () => {
    const map = { routine: ["LA-8111"], pump: ["PUMP_STATION_6"] };
    saveAssignments(map);
    expect(loadAssignments()).toEqual(map);
  });

  it("getStationsFor trả [] khi checklist chưa có trạm", () => {
    expect(getStationsFor({}, "routine")).toEqual([]);
    expect(getStationsFor({ pump: ["X"] }, "routine")).toEqual([]);
  });

  it("getStationsFor trả danh sách trạm của checklist", () => {
    expect(getStationsFor({ routine: ["LA-8111"] }, "routine")).toEqual(["LA-8111"]);
  });

  it("isAssigned phản ánh đúng trạng thái", () => {
    const map = { routine: ["LA-8111"] };
    expect(isAssigned(map, "routine", "LA-8111")).toBe(true);
    expect(isAssigned(map, "routine", "OTHER")).toBe(false);
    expect(isAssigned(map, "pump", "LA-8111")).toBe(false);
  });

  it("toggleStation thêm trạm vào checklist (immutable)", () => {
    const before = {};
    const after = toggleStation(before, "routine", "LA-8111");
    expect(after).toEqual({ routine: ["LA-8111"] });
    expect(before).toEqual({}); // không mutate input
  });

  it("toggleStation lần 2 gỡ trạm ra", () => {
    const map = toggleStation({}, "pump", "PUMP_STATION_6");
    const off = toggleStation(map, "pump", "PUMP_STATION_6");
    expect(isAssigned(off, "pump", "PUMP_STATION_6")).toBe(false);
  });

  it("toggleStation giữ các trạm khác trong cùng checklist", () => {
    let map = toggleStation({}, "routine", "A");
    map = toggleStation(map, "routine", "B");
    expect(getStationsFor(map, "routine").sort()).toEqual(["A", "B"]);
    map = toggleStation(map, "routine", "A");
    expect(getStationsFor(map, "routine")).toEqual(["B"]);
  });

  it("một trạm có thể thuộc nhiều checklist độc lập", () => {
    let map = toggleStation({}, "routine", "LA-8111");
    map = toggleStation(map, "safety", "LA-8111");
    expect(isAssigned(map, "routine", "LA-8111")).toBe(true);
    expect(isAssigned(map, "safety", "LA-8111")).toBe(true);
  });
});
