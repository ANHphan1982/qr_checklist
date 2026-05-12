import { describe, it, expect } from "vitest";
import { buildStationsRows, buildAliasesRows, buildHistoryRows, isOutOfRange } from "../exportExcel";

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

// ---------------------------------------------------------------------------
// buildHistoryRows — operational params (TDD)
// ---------------------------------------------------------------------------
describe("buildHistoryRows — operational params", () => {
  it("includes 'Thông số' column always", () => {
    const log = { id: 1, location: "TK-5203A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true, oil_level_mm: 1250.5 };
    const [row] = buildHistoryRows([log]);
    expect(row).toHaveProperty("Thông số");
  });

  it("renders oil_level_mm value when present", () => {
    const log = { id: 1, location: "TK-5203A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true, oil_level_mm: 1250.5 };
    const [row] = buildHistoryRows([log]);
    expect(row["Thông số"]).toBe(1250.5);
  });

  it("leaves 'Thông số' empty when null", () => {
    const log = { id: 2, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: false, oil_level_mm: null };
    const [row] = buildHistoryRows([log]);
    expect(row["Thông số"]).toBe("");
  });

  it("leaves 'Thông số' empty when field absent (backward compat)", () => {
    const log = { id: 3, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: false };
    const [row] = buildHistoryRows([log]);
    expect(row["Thông số"]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildHistoryRows — route assessment columns (TDD)
// Server enrich logs với 4 fields: distance_from_prev_m, expected_travel_min,
// actual_travel_min, assessment. Excel phải có 4 cột tương ứng.
// ---------------------------------------------------------------------------
describe("buildHistoryRows — route assessment columns", () => {
  const enrichedLogs = [
    {
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      geo_distance: 30,
      email_sent: true,
      distance_from_prev_m: null,
      expected_travel_min: null,
      actual_travel_min: null,
      assessment: "first",
    },
    {
      id: 2,
      location: "B",
      scanned_at: "2026-04-18T01:04:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      geo_distance: 25,
      email_sent: true,
      distance_from_prev_m: 1015.3,
      expected_travel_min: 4.06,
      actual_travel_min: 4.0,
      assessment: "ok",
    },
    {
      id: 3,
      location: "C",
      scanned_at: "2026-04-18T01:05:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      geo_distance: 25,
      email_sent: true,
      distance_from_prev_m: 1000,
      expected_travel_min: 4.0,
      actual_travel_min: 1.0,
      assessment: "too_fast",
    },
    {
      id: 4,
      location: "D",
      scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      geo_distance: 25,
      email_sent: true,
      distance_from_prev_m: 1000,
      expected_travel_min: 4.0,
      actual_travel_min: 25.0,
      assessment: "too_slow",
    },
  ];

  it("includes 4 new columns when assessment fields present", () => {
    const [, row] = buildHistoryRows(enrichedLogs);
    expect(row).toHaveProperty("Khoảng cách từ trạm trước (m)");
    expect(row).toHaveProperty("Thời gian dự kiến (phút)");
    expect(row).toHaveProperty("Thời gian thực tế (phút)");
    expect(row).toHaveProperty("Đánh giá tốc độ");
  });

  it("formats distance with no decimals", () => {
    const rows = buildHistoryRows(enrichedLogs);
    expect(rows[1]["Khoảng cách từ trạm trước (m)"]).toBe(1015);
  });

  it("formats time fields with 1 decimal", () => {
    const rows = buildHistoryRows(enrichedLogs);
    expect(rows[1]["Thời gian dự kiến (phút)"]).toBe(4.1);
    expect(rows[1]["Thời gian thực tế (phút)"]).toBe(4.0);
  });

  it("renders Vietnamese labels for assessment values", () => {
    const rows = buildHistoryRows(enrichedLogs);
    expect(rows[0]["Đánh giá tốc độ"]).toBe("Trạm đầu");
    expect(rows[1]["Đánh giá tốc độ"]).toBe("Bình thường");
    expect(rows[2]["Đánh giá tốc độ"]).toBe("Quá nhanh");
    expect(rows[3]["Đánh giá tốc độ"]).toBe("Quá lâu");
  });

  it("leaves assessment columns empty when fields missing (backward compat)", () => {
    const oldFormatLog = [{
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev",
      geo_status: "ok",
      geo_distance: 30,
      email_sent: true,
      // distance_from_prev_m, expected_travel_min, ... vắng mặt
    }];
    const [row] = buildHistoryRows(oldFormatLog);
    expect(row["Khoảng cách từ trạm trước (m)"]).toBe("");
    expect(row["Thời gian dự kiến (phút)"]).toBe("");
    expect(row["Thời gian thực tế (phút)"]).toBe("");
    expect(row["Đánh giá tốc độ"]).toBe("");
  });

  it("renders 'Bỏ qua' for skipped assessment", () => {
    const log = [{
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev",
      geo_status: "ok",
      email_sent: true,
      distance_from_prev_m: null,
      expected_travel_min: null,
      actual_travel_min: 5,
      assessment: "skipped",
    }];
    const [row] = buildHistoryRows(log);
    expect(row["Đánh giá tốc độ"]).toBe("Bỏ qua (thiếu tọa độ)");
  });
});

// ---------------------------------------------------------------------------
// isOutOfRange — helper giới hạn vận hành (TDD)
// ---------------------------------------------------------------------------

describe("isOutOfRange", () => {
  it("false khi value là null", () => {
    expect(isOutOfRange(null, 100, 1500)).toBe(false);
  });

  it("false khi cả low và high đều null (không cấu hình giới hạn)", () => {
    expect(isOutOfRange(500, null, null)).toBe(false);
  });

  it("false khi value nằm trong [low, high]", () => {
    expect(isOutOfRange(800, 100, 1500)).toBe(false);
  });

  it("false khi value bằng đúng giới hạn dưới (biên L)", () => {
    expect(isOutOfRange(100, 100, 1500)).toBe(false);
  });

  it("false khi value bằng đúng giới hạn trên (biên H)", () => {
    expect(isOutOfRange(1500, 100, 1500)).toBe(false);
  });

  it("true khi value < low (dưới giới hạn L)", () => {
    expect(isOutOfRange(50, 100, 1500)).toBe(true);
  });

  it("true khi value > high (vượt giới hạn H)", () => {
    expect(isOutOfRange(2000, 100, 1500)).toBe(true);
  });

  it("true khi chỉ có low và value < low", () => {
    expect(isOutOfRange(50, 100, null)).toBe(true);
  });

  it("false khi chỉ có low và value >= low", () => {
    expect(isOutOfRange(150, 100, null)).toBe(false);
  });

  it("true khi chỉ có high và value > high", () => {
    expect(isOutOfRange(2000, null, 1500)).toBe(true);
  });

  it("false khi chỉ có high và value <= high", () => {
    expect(isOutOfRange(1200, null, 1500)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildHistoryRows — giới hạn vận hành (TDD)
// Khi truyền paramConfigs, thêm cột "Cảnh báo" hiển thị trạng thái giới hạn
// ---------------------------------------------------------------------------

describe("buildHistoryRows — giới hạn vận hành", () => {
  const makeLog = (location, oil_level_mm) => ({
    id: 1, location, scanned_at: "2026-04-18T01:30:00.000Z",
    device_id: "d", geo_status: "ok", geo_distance: 30,
    email_sent: true, oil_level_mm,
  });

  const configs = {
    "TK-5203A": { param_label: "Tank level", param_unit: "mm", param_low: 200, param_high: 1400 },
    "TK-5205A": { param_label: "Tank level", param_unit: "mm", param_low: null, param_high: null },
  };

  it("luôn có cột 'Cảnh báo' khi truyền paramConfigs", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", 800)], configs);
    expect(row).toHaveProperty("Cảnh báo");
  });

  it("'Cảnh báo' rỗng khi value trong giới hạn", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", 800)], configs);
    expect(row["Cảnh báo"]).toBe("");
  });

  it("'Cảnh báo' có nội dung khi value < low", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", 100)], configs);
    expect(row["Cảnh báo"]).not.toBe("");
  });

  it("'Cảnh báo' có nội dung khi value > high", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", 1600)], configs);
    expect(row["Cảnh báo"]).not.toBe("");
  });

  it("'Cảnh báo' rỗng khi trạm không có giới hạn (low=null, high=null)", () => {
    const [row] = buildHistoryRows([makeLog("TK-5205A", 9999)], configs);
    expect(row["Cảnh báo"]).toBe("");
  });

  it("'Cảnh báo' rỗng khi trạm không có trong paramConfigs", () => {
    const [row] = buildHistoryRows([makeLog("UNKNOWN", 9999)], configs);
    expect(row["Cảnh báo"]).toBe("");
  });

  it("backward compat: không có cột 'Cảnh báo' khi gọi không có paramConfigs", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", 100)]);
    expect(row).not.toHaveProperty("Cảnh báo");
  });

  it("'Cảnh báo' rỗng khi oil_level_mm là null dù ngoài giới hạn về lý thuyết", () => {
    const [row] = buildHistoryRows([makeLog("TK-5203A", null)], configs);
    expect(row["Cảnh báo"]).toBe("");
  });
});

