import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  buildStationsRows,
  buildAliasesRows,
  buildHistoryRows,
  isOutOfRange,
  gpsMapsUrl,
  buildHistoryWorksheet,
  buildHistoryWorkbookBase64,
} from "../exportExcel";

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

  it("maps unverified/cached geo_status to Vietnamese labels (không để trống)", () => {
    const extraLogs = [
      { id: 10, location: "PUMP_STATION_6", scanned_at: "2026-04-18T01:30:00.000Z", geo_status: "unverified", geo_distance: null, email_sent: true },
      { id: 11, location: "PUMP_STATION_6", scanned_at: "2026-04-18T01:35:00.000Z", geo_status: "cached", geo_distance: 12, email_sent: true },
    ];
    const rows = buildHistoryRows(extraLogs);
    expect(rows[0]["GPS"]).toBe("Chưa xác thực vị trí");
    expect(rows[1]["GPS"]).toBe("Vị trí lưu tạm");
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
// gpsMapsUrl — link bản đồ từ lat/lng để kiểm tra vị trí nhân viên (TDD)
// ---------------------------------------------------------------------------
describe("gpsMapsUrl", () => {
  it("dựng link Google Maps từ lat/lng", () => {
    expect(gpsMapsUrl({ lat: 15.4088, lng: 108.8146 })).toBe(
      "https://maps.google.com/?q=15.4088,108.8146"
    );
  });

  it("trả '' khi thiếu lat", () => {
    expect(gpsMapsUrl({ lat: null, lng: 108.8146 })).toBe("");
  });

  it("trả '' khi thiếu lng", () => {
    expect(gpsMapsUrl({ lat: 15.4088, lng: undefined })).toBe("");
  });

  it("trả '' khi log rỗng", () => {
    expect(gpsMapsUrl({})).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildHistoryWorksheet — cột GPS thành link click mở bản đồ (TDD)
// ---------------------------------------------------------------------------
describe("buildHistoryWorksheet — GPS hyperlink", () => {
  const gpsCellOf = (ws, rowIdx) => {
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
    const col = headers.indexOf("GPS");
    return ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: col })];
  };

  it("gắn hyperlink Google Maps vào cell cột GPS khi có lat/lng", () => {
    const logs = [{
      id: 1, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
      lat: 15.4088, lng: 108.8146,
    }];
    const ws = buildHistoryWorksheet(logs);
    const cell = gpsCellOf(ws, 0);
    expect(cell.l).toBeTruthy();
    expect(cell.l.Target).toBe("https://maps.google.com/?q=15.4088,108.8146");
  });

  it("không gắn hyperlink khi thiếu lat/lng", () => {
    const logs = [{
      id: 2, location: "TK-5203C", scanned_at: "2026-04-18T08:00:00.000Z",
      device_id: null, geo_status: "no_gps", geo_distance: null, email_sent: false,
    }];
    const ws = buildHistoryWorksheet(logs);
    const cell = gpsCellOf(ws, 0);
    expect(cell.l).toBeFalsy();
  });

  it("vẫn tô đỏ giá trị ngoài giới hạn (giữ hành vi cũ)", () => {
    const logs = [{
      id: 3, location: "PUMP_STATION_6", scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
      lat: 15.4, lng: 108.8,
      param_values: [{ tag: "PG-1", label: "Seal", value: 0.6, unit: "bar", low: null, high: 0.5 }],
    }];
    const ws = buildHistoryWorksheet(logs, {});
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
    const col = headers.indexOf("Giá trị");
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c: col })];
    expect(cell.s.font.color.rgb).toBe("CC0000");
  });
});

// ---------------------------------------------------------------------------
// buildHistoryWorkbookBase64 — dựng workbook xlsx dạng base64 để đính kèm email (TDD)
// ---------------------------------------------------------------------------
describe("buildHistoryWorkbookBase64", () => {
  const logs = [{
    id: 1, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z",
    device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
    oil_level_mm: 800,
  }];

  it("trả base64 string giải mã được thành workbook có sheet 'Lịch sử'", () => {
    const b64 = buildHistoryWorkbookBase64(logs, {});
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);
    const wb = XLSX.read(b64, { type: "base64" });
    expect(wb.SheetNames).toContain("Lịch sử");
  });

  it("giữ nguyên dữ liệu dòng (cùng nội dung với export)", () => {
    const b64 = buildHistoryWorkbookBase64(logs, {});
    const wb = XLSX.read(b64, { type: "base64" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Lịch sử"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Trạm"]).toBe("TK-5201A");
  });

  it("logs rỗng vẫn cho base64 hợp lệ với sheet 'Lịch sử'", () => {
    const b64 = buildHistoryWorkbookBase64([], {});
    const wb = XLSX.read(b64, { type: "base64" });
    expect(wb.SheetNames).toContain("Lịch sử");
  });
});

// ---------------------------------------------------------------------------
// buildHistoryWorksheet / buildHistoryWorkbookBase64 — form báo cáo (TDD)
// Khi truyền reportInfo {shiftLabel, employeeName}: chèn các dòng thông tin
// Ca + Nhân viên thực hiện PHÍA TRÊN header bảng, bảng dữ liệu giữ nguyên
// định dạng (chỉ dịch xuống dưới). Không truyền reportInfo → y hệt như cũ.
// ---------------------------------------------------------------------------
describe("buildHistoryWorksheet — form báo cáo (ca + nhân viên)", () => {
  const logs = [{
    id: 1, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z",
    device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
    lat: 15.4088, lng: 108.8146,
    param_values: [{ tag: "PG-1", label: "Seal", value: 0.6, unit: "bar", low: null, high: 0.5 }],
  }];
  const reportInfo = {
    shiftLabel: "Ca ngày (06:00–18:00)",
    employeeName: "Nguyễn Văn A",
  };

  it("dòng 1: nhãn 'Ca:' + giá trị ca", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    expect(ws["A1"].v).toBe("Ca:");
    expect(ws["B1"].v).toBe("Ca ngày (06:00–18:00)");
  });

  it("dòng 2: nhãn 'Nhân viên thực hiện:' + tên", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    expect(ws["A2"].v).toBe("Nhân viên thực hiện:");
    expect(ws["B2"].v).toBe("Nguyễn Văn A");
  });

  it("header bảng bắt đầu ở dòng 4 (sau 1 dòng trống), giữ nguyên cột như cũ", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    expect(ws["A3"]).toBeUndefined(); // dòng trống ngăn cách
    expect(ws["A4"].v).toBe("ID");
    // các cột khác của bảng không đổi định dạng/thứ tự so với bản không header
    const plain = buildHistoryWorksheet(logs, {});
    const headersPlain = XLSX.utils.sheet_to_json(plain, { header: 1 })[0];
    const headersForm = XLSX.utils.sheet_to_json(ws, { header: 1 })[3];
    expect(headersForm).toEqual(headersPlain);
  });

  it("dữ liệu dòng đầu nằm ngay dưới header bảng (dòng 5)", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    expect(ws["A5"].v).toBe(1); // ID
  });

  it("highlight đỏ giá trị ngoài giới hạn dịch đúng theo offset form", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[3];
    const col = headers.indexOf("Giá trị");
    // header ở r=3 (0-based) → dòng dữ liệu đầu r=4
    const cell = ws[XLSX.utils.encode_cell({ r: 4, c: col })];
    expect(cell.s.font.color.rgb).toBe("CC0000");
  });

  it("hyperlink GPS dịch đúng theo offset form", () => {
    const ws = buildHistoryWorksheet(logs, {}, reportInfo);
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[3];
    const col = headers.indexOf("GPS");
    const cell = ws[XLSX.utils.encode_cell({ r: 4, c: col })];
    expect(cell.l).toBeTruthy();
    expect(cell.l.Target).toBe("https://maps.google.com/?q=15.4088,108.8146");
  });

  it("thiếu employeeName → ô tên để trống nhưng nhãn vẫn hiện (form viết tay)", () => {
    const ws = buildHistoryWorksheet(logs, {}, { shiftLabel: "Ca ngày (06:00–18:00)" });
    expect(ws["A2"].v).toBe("Nhân viên thực hiện:");
    expect(ws["B2"]).toBeUndefined();
    expect(ws["A4"].v).toBe("ID");
  });

  it("backward compat: không truyền reportInfo → header bảng vẫn ở dòng 1", () => {
    const ws = buildHistoryWorksheet(logs, {});
    expect(ws["A1"].v).toBe("ID");
  });

  it("logs rỗng vẫn dựng được form header", () => {
    const ws = buildHistoryWorksheet([], {}, reportInfo);
    expect(ws["A1"].v).toBe("Ca:");
    expect(ws["A2"].v).toBe("Nhân viên thực hiện:");
  });
});

describe("buildHistoryWorkbookBase64 — form báo cáo", () => {
  const logs = [{
    id: 1, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z",
    device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
    oil_level_mm: 800,
  }];

  it("workbook đính kèm email cũng có form header phía trên bảng", () => {
    const b64 = buildHistoryWorkbookBase64(logs, {}, {
      shiftLabel: "Ca đêm (18:00–06:00)",
      employeeName: "Trần Thị B",
    });
    const wb = XLSX.read(b64, { type: "base64" });
    const ws = wb.Sheets["Lịch sử"];
    expect(ws["A1"].v).toBe("Ca:");
    expect(ws["B1"].v).toBe("Ca đêm (18:00–06:00)");
    expect(ws["B2"].v).toBe("Trần Thị B");
    expect(ws["A4"].v).toBe("ID");
    expect(ws["A5"].v).toBe(1);
  });

  it("backward compat: không truyền reportInfo → giữ layout cũ", () => {
    const b64 = buildHistoryWorkbookBase64(logs, {});
    const wb = XLSX.read(b64, { type: "base64" });
    expect(wb.Sheets["Lịch sử"]["A1"].v).toBe("ID");
  });
});

// ---------------------------------------------------------------------------
// buildHistoryRows — operational params (TDD)
// ---------------------------------------------------------------------------
describe("buildHistoryRows — operational params (long format)", () => {
  it("includes per-param columns always", () => {
    const log = { id: 1, location: "TK-5203A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true, oil_level_mm: 1250.5 };
    const [row] = buildHistoryRows([log]);
    expect(row).toHaveProperty("Mã thiết bị");
    expect(row).toHaveProperty("Tên thông số");
    expect(row).toHaveProperty("Giá trị");
    expect(row).toHaveProperty("Đơn vị");
  });

  it("renders oil_level_mm value (backward compat) trong cột Giá trị", () => {
    const log = { id: 1, location: "TK-5203A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true, oil_level_mm: 1250.5 };
    const [row] = buildHistoryRows([log]);
    expect(row["Giá trị"]).toBe(1250.5);
  });

  it("leaves 'Giá trị' empty when null", () => {
    const log = { id: 2, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: false, oil_level_mm: null };
    const [row] = buildHistoryRows([log]);
    expect(row["Giá trị"]).toBe("");
  });

  it("leaves 'Giá trị' empty when field absent (backward compat)", () => {
    const log = { id: 3, location: "TK-5201A", scanned_at: "2026-04-18T01:30:00.000Z", device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: false };
    const [row] = buildHistoryRows([log]);
    expect(row["Giá trị"]).toBe("");
  });

  it("expands param_values thành nhiều dòng (1 dòng / thông số)", () => {
    const log = {
      id: 5, location: "PUMP_STATION_6", scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
      param_values: [
        { tag: "052-PG-038", label: "Discharge pressure", value: 13, unit: "kg/cm2g", low: 5, high: 14 },
        { tag: "052-PG-890", label: "Seal pressure", value: 0.6, unit: "kg/cm2g", low: null, high: 0.5 },
      ],
    };
    const rows = buildHistoryRows([log]);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Mã thiết bị"]).toBe("052-PG-038");
    expect(rows[0]["Giá trị"]).toBe(13);
    expect(rows[0]["Đơn vị"]).toBe("kg/cm2g");
    expect(rows[1]["Tên thông số"]).toBe("Seal pressure");
    expect(rows[1]["Giới hạn trên"]).toBe(0.5);
  });

  it("đánh dấu Cảnh báo cho param_values ngoài ngưỡng (dùng low/high của chính dòng đó)", () => {
    const log = {
      id: 6, location: "PUMP_STATION_6", scanned_at: "2026-04-18T01:30:00.000Z",
      device_id: "d", geo_status: "ok", geo_distance: 30, email_sent: true,
      param_values: [
        { tag: "052-PG-890", label: "Seal pressure", value: 0.6, unit: "kg/cm2g", low: null, high: 0.5 },
      ],
    };
    const [row] = buildHistoryRows([log], {});
    expect(row["Cảnh báo"]).not.toBe("");
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

