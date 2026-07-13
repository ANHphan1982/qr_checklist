/**
 * TDD — buildStationUpdatePayload: payload PUT /api/admin/stations/<editing>
 * Cho phép đổi tên trạm: gửi kèm `name` khi người dùng sửa tên khác tên cũ.
 */
import { describe, it, expect } from "vitest";
import { buildStationUpdatePayload } from "../stationForm";

describe("buildStationUpdatePayload", () => {
  const form = { name: "PUMP_STATION_6", lat: "15.4", lng: "108.8", radius: "300" };

  it("giữ lat/lng/radius như cũ khi tên không đổi (không gửi name)", () => {
    const p = buildStationUpdatePayload(form, "PUMP_STATION_6");
    expect(p).toEqual({ lat: "15.4", lng: "108.8", radius: "300" });
  });

  it("gửi kèm name khi tên mới khác tên đang sửa", () => {
    const p = buildStationUpdatePayload({ ...form, name: "P-5223A" }, "PUMP_STATION_6");
    expect(p.name).toBe("P-5223A");
  });

  it("chuẩn hoá name: trim + UPPER", () => {
    const p = buildStationUpdatePayload({ ...form, name: "  p-5223a " }, "PUMP_STATION_6");
    expect(p.name).toBe("P-5223A");
  });

  it("bỏ qua name rỗng (không vô tình xoá tên)", () => {
    const p = buildStationUpdatePayload({ ...form, name: "   " }, "PUMP_STATION_6");
    expect(p.name).toBeUndefined();
  });

  it("không gửi name khi chỉ khác hoa/thường so với tên cũ", () => {
    const p = buildStationUpdatePayload({ ...form, name: "pump_station_6" }, "PUMP_STATION_6");
    expect(p.name).toBeUndefined();
  });
});
