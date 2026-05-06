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
// buildHistoryRows — screen detection columns (TDD)
// Backend enrich logs với 3 fields: screen_score (0-1), screen_signals
// {flicker, uniformity, moire}, screen_class (clean|suspicious|high_risk|null).
// Excel xuất 5 cột: label class + tổng điểm % + 3 signal %.
// ---------------------------------------------------------------------------
describe("buildHistoryRows — screen detection columns", () => {
  const screenLogs = [
    {
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      email_sent: true,
      screen_score: 0.25,
      screen_signals: { flicker: 0.2, uniformity: 0.3, moire: 0.25 },
      screen_class: "clean",
    },
    {
      id: 2,
      location: "B",
      scanned_at: "2026-04-18T01:05:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      email_sent: true,
      screen_score: 0.65,
      screen_signals: { flicker: 0.7, uniformity: 0.5, moire: 0.4 },
      screen_class: "suspicious",
    },
    {
      id: 3,
      location: "C",
      scanned_at: "2026-04-18T01:10:00.000Z",
      device_id: "dev-1",
      geo_status: "ok",
      email_sent: true,
      screen_score: 0.92,
      screen_signals: { flicker: 0.95, uniformity: 0.9, moire: 0.85 },
      screen_class: "high_risk",
    },
  ];

  it("includes 5 new screen columns", () => {
    const [row] = buildHistoryRows(screenLogs);
    expect(row).toHaveProperty("Nghi vấn màn hình");
    expect(row).toHaveProperty("Điểm nghi vấn (%)");
    expect(row).toHaveProperty("Flicker (%)");
    expect(row).toHaveProperty("Uniformity (%)");
    expect(row).toHaveProperty("Moiré (%)");
  });

  it("renders Vietnamese labels for each screen_class", () => {
    const rows = buildHistoryRows(screenLogs);
    expect(rows[0]["Nghi vấn màn hình"]).toBe("Bình thường");
    expect(rows[1]["Nghi vấn màn hình"]).toBe("Nghi vấn");
    expect(rows[2]["Nghi vấn màn hình"]).toBe("Nguy cơ cao");
  });

  it("renders score as integer percentage (no decimals)", () => {
    const rows = buildHistoryRows(screenLogs);
    expect(rows[0]["Điểm nghi vấn (%)"]).toBe(25);
    expect(rows[1]["Điểm nghi vấn (%)"]).toBe(65);
    expect(rows[2]["Điểm nghi vấn (%)"]).toBe(92);
  });

  it("renders each signal as integer percentage", () => {
    const rows = buildHistoryRows(screenLogs);
    expect(rows[1]["Flicker (%)"]).toBe(70);
    expect(rows[1]["Uniformity (%)"]).toBe(50);
    expect(rows[1]["Moiré (%)"]).toBe(40);
  });

  it("leaves screen columns empty when fields missing (backward compat)", () => {
    // Log cũ chưa có screen detection (NULL trong DB)
    const oldLog = [{
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev",
      geo_status: "ok",
      email_sent: true,
      // screen_* fields vắng mặt
    }];
    const [row] = buildHistoryRows(oldLog);
    expect(row["Nghi vấn màn hình"]).toBe("");
    expect(row["Điểm nghi vấn (%)"]).toBe("");
    expect(row["Flicker (%)"]).toBe("");
    expect(row["Uniformity (%)"]).toBe("");
    expect(row["Moiré (%)"]).toBe("");
  });

  it("handles screen_class set but signals missing", () => {
    // Defensive: client gửi score nhưng không gửi signals dict
    const log = [{
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev",
      geo_status: "ok",
      email_sent: true,
      screen_score: 0.55,
      screen_class: "suspicious",
      screen_signals: null,
    }];
    const [row] = buildHistoryRows(log);
    expect(row["Nghi vấn màn hình"]).toBe("Nghi vấn");
    expect(row["Điểm nghi vấn (%)"]).toBe(55);
    // Signals trống → empty string
    expect(row["Flicker (%)"]).toBe("");
    expect(row["Uniformity (%)"]).toBe("");
    expect(row["Moiré (%)"]).toBe("");
  });

  it("renders score 0% (not empty) when screen_score = 0", () => {
    // Edge case: score = 0 là giá trị hợp lệ (chắc chắn không phải màn hình)
    // — phải hiển thị 0, KHÔNG để trống (null/undefined mới để trống)
    const log = [{
      id: 1,
      location: "A",
      scanned_at: "2026-04-18T01:00:00.000Z",
      device_id: "dev",
      geo_status: "ok",
      email_sent: true,
      screen_score: 0,
      screen_signals: { flicker: 0, uniformity: 0, moire: 0 },
      screen_class: "clean",
    }];
    const [row] = buildHistoryRows(log);
    expect(row["Điểm nghi vấn (%)"]).toBe(0);
    expect(row["Flicker (%)"]).toBe(0);
  });
});
