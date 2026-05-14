/**
 * TDD — lib/pendingParams.js
 *
 * Hướng B: persist pending params state vào localStorage để modal thông số
 * không bị mất khi user thoát app trong lúc API đang timeout (8s).
 * Khi app khởi động lại, nếu queue item còn đó, modal sẽ tự restore.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  savePendingParams,
  loadPendingParams,
  clearPendingParams,
} from "../pendingParams.js";

const MOCK_CONFIG = {
  station_name: "PUMP_STATION_7",
  param_label: "P-5225A_Discharge_Pressure",
  param_unit: "kg/cm2g",
  active: true,
};

beforeEach(() => {
  localStorage.clear();
});

describe("pendingParams — save / load / clear", () => {
  it("savePendingParams + loadPendingParams → trả về đúng dữ liệu", () => {
    savePendingParams("PUMP_STATION_7", MOCK_CONFIG, "2026-05-14T03:15:18.000Z");

    const result = loadPendingParams();
    expect(result).not.toBeNull();
    expect(result.stationName).toBe("PUMP_STATION_7");
    expect(result.config).toEqual(MOCK_CONFIG);
    expect(result.queuedAt).toBe("2026-05-14T03:15:18.000Z");
  });

  it("loadPendingParams khi localStorage trống → null", () => {
    expect(loadPendingParams()).toBeNull();
  });

  it("clearPendingParams → loadPendingParams trả về null", () => {
    savePendingParams("PUMP_STATION_7", MOCK_CONFIG, "2026-05-14T03:15:18.000Z");
    clearPendingParams();
    expect(loadPendingParams()).toBeNull();
  });

  it("savePendingParams ghi đè pending cũ (chỉ 1 pending tại 1 thời điểm)", () => {
    savePendingParams("TK-5203A", { station_name: "TK-5203A" }, "ts-1");
    savePendingParams("PUMP_STATION_7", MOCK_CONFIG, "ts-2");

    const result = loadPendingParams();
    expect(result.stationName).toBe("PUMP_STATION_7");
    expect(result.queuedAt).toBe("ts-2");
  });

  it("loadPendingParams khi localStorage bị corrupt → null, không throw", () => {
    localStorage.setItem("qr_pending_params", "{{invalid json}}");
    expect(loadPendingParams()).toBeNull();
  });
});
