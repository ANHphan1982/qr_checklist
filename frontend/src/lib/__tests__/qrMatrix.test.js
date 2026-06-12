/**
 * TDD — buildQrMatrix: render QR local cho màn hình trạm.
 * Thay api.qrserver.com (lộ token ra bên thứ 3 + chết khi WiFi nội bộ
 * không có internet) bằng thư viện vendor qrcode-generator chạy local.
 */
import { describe, it, expect } from "vitest";
import { buildQrMatrix } from "../qrMatrix.js";

describe("buildQrMatrix", () => {
  it("trả về ma trận vuông boolean", () => {
    const m = buildQrMatrix("TK-5201A|1718160000");
    expect(m.length).toBeGreaterThan(0);
    for (const row of m) {
      expect(row.length).toBe(m.length);
      for (const cell of row) expect(typeof cell).toBe("boolean");
    }
  });

  it("kích thước hợp lệ theo chuẩn QR: 21 + 4k modules", () => {
    const m = buildQrMatrix("PUMP_STATION_6");
    expect((m.length - 21) % 4).toBe(0);
  });

  it("deterministic — cùng nội dung cho cùng ma trận", () => {
    const a = buildQrMatrix("Cổng A");
    const b = buildQrMatrix("Cổng A");
    expect(a).toEqual(b);
  });

  it("nội dung khác cho ma trận khác", () => {
    const a = buildQrMatrix("station-1");
    const b = buildQrMatrix("station-2");
    expect(a).not.toEqual(b);
  });

  it("có finder pattern: góc (0,0), (0,n-7), (n-7,0) là module đen", () => {
    const m = buildQrMatrix("test");
    const n = m.length;
    expect(m[0][0]).toBe(true);
    expect(m[0][n - 1]).toBe(true);
    expect(m[n - 1][0]).toBe(true);
    // tâm finder pattern (3,3) đen, vành trắng (1,5)
    expect(m[3][3]).toBe(true);
    expect(m[1][5]).toBe(false);
  });

  it("hỗ trợ tiếng Việt có dấu (UTF-8) không throw", () => {
    expect(() => buildQrMatrix("Trạm Kiểm Soát C — bể chứa")).not.toThrow();
  });

  it("nội dung dài (token ~100 ký tự) không throw", () => {
    const long = "TK-5211A|" + "x".repeat(100);
    expect(() => buildQrMatrix(long)).not.toThrow();
  });
});
