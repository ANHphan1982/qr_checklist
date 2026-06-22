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
});
