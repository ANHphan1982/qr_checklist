/**
 * RED phase: tests cho BUILTIN_PARAM_CONFIGS — fallback offline khi
 * stationParamConfigs chưa được fetch từ API (thiết bị không có mạng).
 */
import { describe, it, expect } from "vitest";
import { BUILTIN_PARAM_CONFIGS, mergeWithBuiltin } from "../builtinConfigs.js";

describe("BUILTIN_PARAM_CONFIGS — nội dung cấu hình", () => {
  it("chứa TK-5211A với đúng thông số", () => {
    const cfg = BUILTIN_PARAM_CONFIGS["TK-5211A"];
    expect(cfg).toBeDefined();
    expect(cfg.station_name).toBe("TK-5211A");
    expect(cfg.param_label).toBe("Tank level");
    expect(cfg.param_unit).toBe("mm");
    expect(cfg.active).toBe(true);
  });

  it("chứa TK-5205A với đúng thông số", () => {
    const cfg = BUILTIN_PARAM_CONFIGS["TK-5205A"];
    expect(cfg).toBeDefined();
    expect(cfg.station_name).toBe("TK-5205A");
    expect(cfg.param_label).toBe("Tank level");
    expect(cfg.param_unit).toBe("mm");
    expect(cfg.active).toBe(true);
  });

  it("chứa PUMP_STATION_7 với đúng thông số", () => {
    const cfg = BUILTIN_PARAM_CONFIGS["PUMP_STATION_7"];
    expect(cfg).toBeDefined();
    expect(cfg.station_name).toBe("PUMP_STATION_7");
    expect(cfg.param_label).toBe("P-5225A_Discharge_Pressure");
    expect(cfg.param_unit).toBe("kg/cm2g");
    expect(cfg.active).toBe(true);
  });

  it("chứa TK-5203A với đúng thông số", () => {
    const cfg = BUILTIN_PARAM_CONFIGS["TK-5203A"];
    expect(cfg).toBeDefined();
    expect(cfg.station_name).toBe("TK-5203A");
    expect(cfg.param_label).toBe("Tank level");
    expect(cfg.param_unit).toBe("mm");
    expect(cfg.active).toBe(true);
  });

  it("mọi entry đều có active=true", () => {
    Object.values(BUILTIN_PARAM_CONFIGS).forEach((cfg) => {
      expect(cfg.active).toBe(true);
    });
  });

  it("mọi entry đều có station_name khớp với key", () => {
    Object.entries(BUILTIN_PARAM_CONFIGS).forEach(([key, cfg]) => {
      expect(cfg.station_name).toBe(key);
    });
  });
});

describe("mergeWithBuiltin — ưu tiên cache/API, builtin là fallback", () => {
  it("cache rỗng → trả về builtin", () => {
    const result = mergeWithBuiltin({});
    expect(result["PUMP_STATION_7"]).toBeDefined();
    expect(result["TK-5203A"]).toBeDefined();
  });

  it("cache có dữ liệu → cache thắng khi trùng key", () => {
    const cached = {
      "PUMP_STATION_7": {
        station_name: "PUMP_STATION_7",
        param_label: "P-5225A_Discharge_Pressure_UPDATED",
        param_unit: "bar",
        active: true,
      },
    };
    const result = mergeWithBuiltin(cached);
    expect(result["PUMP_STATION_7"].param_unit).toBe("bar");
    expect(result["PUMP_STATION_7"].param_label).toBe("P-5225A_Discharge_Pressure_UPDATED");
  });

  it("cache có trạm mới không có trong builtin → vẫn được giữ lại", () => {
    const cached = {
      "NEW_STATION": { station_name: "NEW_STATION", param_label: "Nhiệt độ", param_unit: "°C", active: true },
    };
    const result = mergeWithBuiltin(cached);
    expect(result["NEW_STATION"]).toBeDefined();
    expect(result["PUMP_STATION_7"]).toBeDefined(); // builtin vẫn có
  });

  it("cache null/undefined → trả về builtin, không crash", () => {
    expect(() => mergeWithBuiltin(null)).not.toThrow();
    expect(() => mergeWithBuiltin(undefined)).not.toThrow();
    expect(mergeWithBuiltin(null)["PUMP_STATION_7"]).toBeDefined();
  });

  it("thiết bị offline hoàn toàn (localStorage rỗng) → PUMP_STATION_7 vẫn có config", () => {
    // Simulate: khởi tạo state với cache rỗng (lần đầu mở app offline)
    const stationParamConfigs = mergeWithBuiltin({});
    const paramConfig = stationParamConfigs["PUMP_STATION_7"];
    expect(paramConfig).toBeDefined();
    expect(paramConfig.param_label).toBe("P-5225A_Discharge_Pressure");
  });
});
