import { describe, it, expect } from "vitest";
import { buildStationsRows, buildAliasesRows, buildHistoryRows } from "../exportExcel";

// ---------------------------------------------------------------------------
// buildStationsRows
// ---------------------------------------------------------------------------
describe("buildStationsRows", () => {
  const stations = [
    { name: "TK-5201A", lat: 15.4088, lng: 108.8146, radius: 300, active: true },
    { name: "TK-5202B", lat: 15.4090, lng: 108.8150, radius: 200, active: false },
  ];

  it("returns one row per station", () => {
    expect(buildStationsRows(stations)).toHaveLength(2);
  });

  it("maps fields to Vietnamese column names", () => {
    const [row] = buildStationsRows(stations);
    expect(row).toHaveProperty("Tên trạm");
    expect(row).toHaveProperty("Latitude");
    expect(row).toHaveProperty("Longitude");
    expect(row).toHaveProperty("Bán kính (m)");
    expect(row).toHaveProperty("Trạng thái");
  });

  it("maps data values correctly", () => {
    const [row] = buildStationsRows(stations);
    expect(row["Tên trạm"]).toBe("TK-5201A");
    expect(row["Latitude"]).toBe(15.4088);
    expect(row["Bán kính (m)"]).toBe(300);
    expect(row["Trạng thái"]).toBe("Hoạt động");
  });

  it("marks inactive stations correctly", () => {
    const rows = buildStationsRows(stations);
    expect(rows[1]["Trạng thái"]).toBe("Vô hiệu");
  });

  it("returns empty array for empty input", () => {
    expect(buildStationsRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildAliasesRows
// ---------------------------------------------------------------------------
describe("buildAliasesRows", () => {
  const aliases = [
    { id: 1, qr_content: "052-LI-066B", station_name: "TK-5201A", note: "Level gauge" },
    { id: 2, qr_content: "052-LI-067A", station_name: "TK-5201A", note: "" },
  ];

  it("returns one row per alias", () => {
    expect(buildAliasesRows(aliases)).toHaveLength(2);
  });

  it("maps fields to Vietnamese column names", () => {
    const [row] = buildAliasesRows(aliases);
    expect(row).toHaveProperty("Nội dung QR");
    expect(row).toHaveProperty("Tên trạm");
    expect(row).toHaveProperty("Ghi chú");
  });

  it("maps data values correctly", () => {
    const [row] = buildAliasesRows(aliases);
    expect(row["Nội dung QR"]).toBe("052-LI-066B");
    expect(row["Tên trạm"]).toBe("TK-5201A");
    expect(row["Ghi chú"]).toBe("Level gauge");
  });

  it("handles empty note", () => {
    const rows = buildAliasesRows(aliases);
    expect(rows[1]["Ghi chú"]).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(buildAliasesRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildHistoryRows
// ---------------------------------------------------------------------------
describe("buildHistoryRows", () => {
  const logs = [
    {
      id: 1,
      location: "TK-5201A",
      scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "ua-hash-abc",
      geo_status: "ok",
      geo_distance: 45.5,
      email_sent: true,
    },
    {
      id: 2,
      location: "TK-5202B",
      scanned_at: "2026-04-18T05:00:00.000Z",
      device_id: "ua-hash-xyz",
      geo_status: "out_of_range",
      geo_distance: 620,
      email_sent: false,
    },
    {
      id: 3,
      location: "TK-5203C",
      scanned_at: "2026-04-18T08:00:00.000Z",
      device_id: null,
      geo_status: "no_gps",
      geo_distance: null,
      email_sent: false,
    },
  ];

  it("returns one row per log", () => {
    expect(buildHistoryRows(logs)).toHaveLength(3);
  });

  it("maps fields to Vietnamese column names", () => {
    const [row] = buildHistoryRows(logs);
    expect(row).toHaveProperty("ID");
    expect(row).toHaveProperty("Trạm");
    expect(row).toHaveProperty("Thời gian (VN)");
    expect(row).toHaveProperty("GPS");
    expect(row).toHaveProperty("Khoảng cách (m)");
    expect(row).toHaveProperty("Email");
  });

  it("formats scanned_at to Vietnam timezone string", () => {
    const [row] = buildHistoryRows(logs);
    // 2026-04-18T01:30:00Z = 08:30 VN (UTC+7)
    expect(row["Thời gian (VN)"]).toContain("08:30");
    expect(row["Thời gian (VN)"]).toContain("18/04/2026");
  });

  it("maps geo_status to Vietnamese label", () => {
    const rows = buildHistoryRows(logs);
    expect(rows[0]["GPS"]).toBe("Đúng trạm");
    expect(rows[1]["GPS"]).toBe("Ngoài phạm vi");
    expect(rows[2]["GPS"]).toBe("Không có GPS");
  });

  it("maps email_sent to Vietnamese label", () => {
    const rows = buildHistoryRows(logs);
    expect(rows[0]["Email"]).toBe("Đã gửi");
    expect(rows[1]["Email"]).toBe("Chưa gửi");
  });

  it("handles null geo_distance gracefully", () => {
    const rows = buildHistoryRows(logs);
    expect(rows[2]["Khoảng cách (m)"]).toBe("");
  });

  it("handles null device_id gracefully", () => {
    const rows = buildHistoryRows(logs);
    expect(rows[2]["Device ID"]).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(buildHistoryRows([])).toEqual([]);
  });
});
