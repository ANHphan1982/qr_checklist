/**
 * TDD — checklistStations: helper thuần thao tác map "checklist → [trạm]".
 * Hướng A: mapping LƯU Ở BACKEND (cột stations.checklist_type), frontend chỉ
 * đọc qua API rồi dựng map. Không còn localStorage (đồng bộ mọi thiết bị).
 */
import { describe, it, expect } from "vitest";
import {
  getStationsFor,
  isAssigned,
  assignmentsFromStations,
  getChecklistTypesOf,
} from "../checklistStations";

describe("getStationsFor / isAssigned", () => {
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
});

describe("assignmentsFromStations", () => {
  const stations = [
    { name: "LA-8111", checklist_type: "routine", active: true },
    { name: "PUMP_STATION_6", checklist_type: "pump", active: true },
    { name: "LA-9000", checklist_type: "routine", active: true },
    { name: "NOTYPE", checklist_type: null, active: true },
    { name: "OFF", checklist_type: "pump", active: false },
  ];

  it("gom trạm active theo checklist_type", () => {
    expect(assignmentsFromStations(stations)).toEqual({
      routine: ["LA-8111", "LA-9000"],
      pump: ["PUMP_STATION_6"],
    });
  });

  it("bỏ qua trạm không gán hoặc đã tắt", () => {
    const map = assignmentsFromStations(stations);
    expect(map.pump).not.toContain("OFF");
    expect(Object.values(map).flat()).not.toContain("NOTYPE");
  });

  it("đầu vào rỗng / undefined → {}", () => {
    expect(assignmentsFromStations([])).toEqual({});
    expect(assignmentsFromStations(undefined)).toEqual({});
  });

  it("trạm thuộc nhiều checklist → xuất hiện ở mỗi checklist", () => {
    const multi = [
      { name: "LA-8111", checklist_types: ["routine", "safety"], active: true },
      { name: "PUMP_STATION_6", checklist_types: ["pump"], active: true },
    ];
    expect(assignmentsFromStations(multi)).toEqual({
      routine: ["LA-8111"],
      safety: ["LA-8111"],
      pump: ["PUMP_STATION_6"],
    });
  });
});

describe("getChecklistTypesOf", () => {
  it("trả mảng checklist_types đã chuẩn hoá (lowercase, dedupe)", () => {
    expect(getChecklistTypesOf({ checklist_types: ["Pump", "routine", "pump"] }))
      .toEqual(["pump", "routine"]);
  });

  it("fallback checklist_type (single) khi chưa có checklist_types", () => {
    expect(getChecklistTypesOf({ checklist_type: "Routine" })).toEqual(["routine"]);
  });

  it("[] khi chưa gán hoặc đầu vào rỗng", () => {
    expect(getChecklistTypesOf({})).toEqual([]);
    expect(getChecklistTypesOf(null)).toEqual([]);
  });
});
