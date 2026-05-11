/**
 * RED phase: tests cho QR_ALIAS_MAP và resolveStationName.
 *
 * QR code dán tại trạm chứa mã thiết bị (alias), không phải tên trạm.
 * Backend có QR_ALIAS_MAP để resolve. Frontend cần mirror để lookup
 * paramConfig đúng trong offline path (không qua server).
 */
import { describe, it, expect } from "vitest";
import { QR_ALIAS_MAP, resolveStationName } from "../stationsConfig.js";

describe("QR_ALIAS_MAP — khớp với backend stations_config.py", () => {
  it("052-LI-042B → TK-5211A", () => {
    expect(QR_ALIAS_MAP["052-LI-042B"]).toBe("TK-5211A");
  });

  it("052-LI-066B → TK-5205A", () => {
    expect(QR_ALIAS_MAP["052-LI-066B"]).toBe("TK-5205A");
  });

  it("052-PG-071 → PUMP_STATION_7", () => {
    expect(QR_ALIAS_MAP["052-PG-071"]).toBe("PUMP_STATION_7");
  });

  it("052-LI-022B → TK-5201A", () => {
    expect(QR_ALIAS_MAP["052-LI-022B"]).toBe("TK-5201A");
  });

  it("052-LI-010B → TK-5203A", () => {
    expect(QR_ALIAS_MAP["052-LI-010B"]).toBe("TK-5203A");
  });

  it("chứa đủ 11 alias từ backend", () => {
    expect(Object.keys(QR_ALIAS_MAP).length).toBe(11);
  });
});

describe("resolveStationName — resolve alias hoặc giữ nguyên tên trạm", () => {
  it("alias 052-LI-042B → TK-5211A", () => {
    expect(resolveStationName("052-LI-042B")).toBe("TK-5211A");
  });

  it("alias 052-PG-071 → PUMP_STATION_7", () => {
    expect(resolveStationName("052-PG-071")).toBe("PUMP_STATION_7");
  });

  it("alias 052-LI-066B → TK-5205A", () => {
    expect(resolveStationName("052-LI-066B")).toBe("TK-5205A");
  });

  it("tên trạm đã resolve (admin config) → giữ nguyên", () => {
    // Admin cấu hình bằng tên trạm thật — resolveStationName không được làm hỏng
    expect(resolveStationName("TK-5211A")).toBe("TK-5211A");
    expect(resolveStationName("PUMP_STATION_7")).toBe("PUMP_STATION_7");
    expect(resolveStationName("TK-5205A")).toBe("TK-5205A");
  });

  it("QR text không có trong alias map → trả về chính nó", () => {
    expect(resolveStationName("UNKNOWN_STATION")).toBe("UNKNOWN_STATION");
    expect(resolveStationName("")).toBe("");
  });
});
