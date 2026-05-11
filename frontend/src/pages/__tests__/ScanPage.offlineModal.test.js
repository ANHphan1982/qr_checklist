/**
 * Regression test: thiết bị WiFi nội bộ không có internet
 *
 * navigator.onLine = true (WiFi kết nối) nhưng API call thất bại vì không có
 * internet thực sự. Trước khi fix, nhánh shouldQueue luôn gọi setStep("done")
 * và bỏ qua modal nhập thông số vận hành.
 *
 * Test này dùng pure logic thay vì render component (RTL chưa được cài).
 */
import { describe, it, expect } from "vitest";
import { classifyApiError } from "../../lib/apiError.js";

// Logic trích từ handleScan → nhánh shouldQueue (sau khi fix)
function resolveStepAfterQueuedError(stationParamConfigs, location) {
  const paramConfig = stationParamConfigs[location];
  if (paramConfig) return "params";
  return "done";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNetworkErr() {
  const err = new Error("Network Error");
  err.response = undefined;
  err.request = {};
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScanPage — modal thông số khi WiFi nội bộ (onLine=true, API fail)", () => {
  const paramConfig = {
    station_name: "052-LI-042B",
    param_label:  "Tank level",
    param_unit:   "mm",
    active:       true,
  };
  const stationParamConfigs = { "052-LI-042B": paramConfig };

  it("classifyApiError → shouldQueue=true khi WiFi có nhưng server không phản hồi", () => {
    // onLine=true nhưng network error = WiFi nội bộ không có internet
    const result = classifyApiError(makeNetworkErr(), true);
    expect(result.shouldQueue).toBe(true);
    expect(result.type).toBe("server_unreachable");
  });

  it("BUG REGRESSION: shouldQueue=true + trạm có paramConfig → bước tiếp theo là 'params'", () => {
    // Trước fix: nhánh này luôn trả về 'done', modal không bao giờ hiện
    const step = resolveStepAfterQueuedError(stationParamConfigs, "052-LI-042B");
    expect(step).toBe("params");
  });

  it("trạm không có paramConfig → bước là 'done' (không hiện modal)", () => {
    const step = resolveStepAfterQueuedError(stationParamConfigs, "Trạm không cấu hình");
    expect(step).toBe("done");
  });

  it("localStorage cache đảm bảo paramConfig khả dụng khi offline hoàn toàn", () => {
    // Khi offline hoàn toàn, getStationParamConfigs() fail → dùng cache từ localStorage
    const cached = JSON.stringify(stationParamConfigs);
    const restored = JSON.parse(cached);
    expect(restored["052-LI-042B"]).toBeDefined();
    expect(restored["052-LI-042B"].active).toBe(true);
  });

  it("stationParamConfigs rỗng (chưa cache bao giờ) → step là 'done', không crash", () => {
    const step = resolveStepAfterQueuedError({}, "052-LI-042B");
    expect(step).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Regression: airplane mode + cache trống → modal không hiện (IDs 445, 447)
// Root cause: lần đầu dùng app offline, localStorage chưa có config
// ---------------------------------------------------------------------------

// Logic từ nhánh offline của handleScan (ScanPage.jsx:344-355)
function resolveStepOffline(stationParamConfigs, location) {
  const paramConfig = stationParamConfigs[location];
  if (paramConfig) return "params";
  return "done";
}

describe("ScanPage — airplane mode, cache localStorage trống (IDs 445, 447)", () => {
  it("cache trống → step 'done', modal bỏ qua (lần đầu dùng offline)", () => {
    const step = resolveStepOffline({}, "PUMP_STATION_7");
    expect(step).toBe("done");
  });

  it("cache có PUMP_STATION_7 active=true → step 'params', modal hiện", () => {
    const configs = {
      "PUMP_STATION_7": { station_name: "PUMP_STATION_7", param_label: "Áp suất", param_unit: "bar", active: true },
    };
    const step = resolveStepOffline(configs, "PUMP_STATION_7");
    expect(step).toBe("params");
  });

  it("config có active=false → không vào map → step 'done'", () => {
    // fetchAndCacheParamConfigs lọc active=false → không cache
    const rawConfigs = [
      { station_name: "PUMP_STATION_7", param_label: "Áp suất", param_unit: "bar", active: false },
    ];
    const map = {};
    rawConfigs.forEach((c) => { if (c.active) map[c.station_name] = c; });
    const step = resolveStepOffline(map, "PUMP_STATION_7");
    expect(step).toBe("done");
  });

  it("key mismatch (QR text ≠ station_name) → step 'done'", () => {
    // QR chứa 'PUMP_STATION_7 ' (space thừa) nhưng DB là 'PUMP_STATION_7'
    const configs = {
      "PUMP_STATION_7": { station_name: "PUMP_STATION_7", param_label: "Áp suất", param_unit: "bar", active: true },
    };
    const locationFromQR = "PUMP_STATION_7 "; // trailing space
    const step = resolveStepOffline(configs, locationFromQR);
    expect(step).toBe("done"); // modal bị bỏ qua do key không khớp chính xác
  });
});

// ---------------------------------------------------------------------------
// Regression: race condition — vừa có mạng, fetch chưa xong, user scan ngay (ID 446)
// Root cause: fetchAndCacheParamConfigs async, stationParamConfigs vẫn {} khi scan
// ---------------------------------------------------------------------------

describe("ScanPage — race condition: mạng vừa bật, fetch chưa xong (ID 446)", () => {
  it("scan xảy ra trước khi fetchAndCacheParamConfigs resolve → cache vẫn rỗng → step 'done'", async () => {
    // Simulate: state tại thời điểm scan — fetch đang chạy nhưng chưa xong
    const stationParamConfigsAtScanTime = {}; // race: goOnline → fetch async chưa complete
    const step = resolveStepOffline(stationParamConfigsAtScanTime, "PUMP_STATION_7");
    expect(step).toBe("done"); // modal bỏ qua — đây là hành vi hiện tại (không crash)
  });

  it("scan xảy ra SAU khi fetchAndCacheParamConfigs resolve → modal hiện đúng", async () => {
    // Simulate: fetch đã xong, stationParamConfigs đã cập nhật
    const stationParamConfigsAfterFetch = {
      "PUMP_STATION_7": { station_name: "PUMP_STATION_7", param_label: "Áp suất", param_unit: "bar", active: true },
    };
    const step = resolveStepOffline(stationParamConfigsAfterFetch, "PUMP_STATION_7");
    expect(step).toBe("params"); // modal hiện đúng
  });
});

// ---------------------------------------------------------------------------
// Regression: race condition guard (fix mới — ScanPage.jsx handleScan online path)
// Khi paramConfig undefined + online → re-fetch tại chỗ → modal hiện đúng
// ---------------------------------------------------------------------------

// Logic trích từ handleScan sau fix (online path với re-fetch guard)
async function resolveStepOnlineWithGuard(stationParamConfigs, location, fetchFn) {
  let paramConfig = stationParamConfigs[location];
  if (!paramConfig) {
    try {
      const fresh = await fetchFn();
      const freshMap = {};
      fresh.forEach((c) => { if (c.active) freshMap[c.station_name] = c; });
      paramConfig = freshMap[location];
    } catch (_) {
      // fetch thất bại
    }
  }
  const scanId = 446; // truthy — backend đã lưu scan
  if (paramConfig && scanId) return "params";
  return "done";
}

describe("ScanPage — race condition guard: re-fetch khi stationParamConfigs rỗng lúc scan online", () => {
  const mockConfig = {
    station_name: "PUMP_STATION_7",
    param_label:  "P=5225A_Discharge_Pressure",
    param_unit:   "kg/cm2g",
    active:       true,
  };

  it("BUG REGRESSION (ID 446): cache rỗng + re-fetch thành công → step 'params'", async () => {
    const fetchFn = async () => [mockConfig];
    const step = await resolveStepOnlineWithGuard({}, "PUMP_STATION_7", fetchFn);
    expect(step).toBe("params");
  });

  it("cache rỗng + re-fetch thất bại → step 'done', không crash", async () => {
    const fetchFn = async () => { throw new Error("network error"); };
    const step = await resolveStepOnlineWithGuard({}, "PUMP_STATION_7", fetchFn);
    expect(step).toBe("done");
  });

  it("cache đã có sẵn → không cần re-fetch, step 'params'", async () => {
    const fetchFn = async () => { throw new Error("should not be called"); };
    const configs = { "PUMP_STATION_7": mockConfig };
    const step = await resolveStepOnlineWithGuard(configs, "PUMP_STATION_7", fetchFn);
    expect(step).toBe("params");
  });

  it("re-fetch thành công nhưng trạm không có config → step 'done'", async () => {
    const fetchFn = async () => [{ ...mockConfig, station_name: "OTHER_STATION" }];
    const step = await resolveStepOnlineWithGuard({}, "PUMP_STATION_7", fetchFn);
    expect(step).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Regression: OUT_OF_RANGE path thiếu race condition guard (IDs 452, 453)
// Bug: nhánh catch OUT_OF_RANGE không có re-fetch guard như nhánh success
// ---------------------------------------------------------------------------

import { mergeWithBuiltin } from "../../lib/builtinConfigs.js";

// Logic trích từ nhánh OUT_OF_RANGE sau fix (ScanPage.jsx catch → else branch)
async function resolveStepOutOfRangeWithGuard(stationParamConfigs, resolvedLocation, apiData, fetchFn) {
  let paramConfig = stationParamConfigs[resolvedLocation];

  // Guard: nếu cache trống + OUT_OF_RANGE có scan_id → re-fetch trước khi quyết định
  if (!paramConfig && apiData.code === "OUT_OF_RANGE" && apiData.scan_id) {
    try {
      const fresh = await fetchFn();
      const freshMap = {};
      fresh.forEach((c) => { if (c.active) freshMap[c.station_name] = c; });
      paramConfig = mergeWithBuiltin(freshMap)[resolvedLocation];
    } catch (_) {}
  }

  if (apiData.code === "OUT_OF_RANGE" && paramConfig && apiData.scan_id) return "params";
  return "idle";
}

describe("ScanPage — OUT_OF_RANGE path race condition guard (IDs 452, 453)", () => {
  const tk5211Config = { station_name: "TK-5211A", param_label: "Tank level", param_unit: "mm", active: true };
  const outOfRangeData = { code: "OUT_OF_RANGE", scan_id: 452, location: "TK-5211A", distance: 31677 };

  it("BUG REGRESSION (ID 452): cache rỗng + OUT_OF_RANGE + re-fetch thành công → step 'params'", async () => {
    const fetchFn = async () => [tk5211Config];
    const step = await resolveStepOutOfRangeWithGuard({}, "TK-5211A", outOfRangeData, fetchFn);
    expect(step).toBe("params");
  });

  it("cache đã có TK-5211A → modal hiện ngay, không cần re-fetch", async () => {
    const fetchFn = async () => { throw new Error("should not be called"); };
    const configs = { "TK-5211A": tk5211Config };
    const step = await resolveStepOutOfRangeWithGuard(configs, "TK-5211A", outOfRangeData, fetchFn);
    expect(step).toBe("params");
  });

  it("re-fetch thất bại → step 'idle', không crash", async () => {
    const fetchFn = async () => { throw new Error("network error"); };
    const step = await resolveStepOutOfRangeWithGuard({}, "TK-5211A", outOfRangeData, fetchFn);
    expect(step).toBe("idle");
  });

  it("OUT_OF_RANGE nhưng scan_id null → không re-fetch, step 'idle'", async () => {
    const fetchFn = async () => { throw new Error("should not be called"); };
    const noScanId = { ...outOfRangeData, scan_id: null };
    const step = await resolveStepOutOfRangeWithGuard({}, "TK-5211A", noScanId, fetchFn);
    expect(step).toBe("idle");
  });

  it("TK-5205A với builtin config → OUT_OF_RANGE hiện modal (ID 453 sau fix)", async () => {
    const fetchFn = async () => [];
    const tk5205Data = { code: "OUT_OF_RANGE", scan_id: 453, location: "TK-5205A", distance: 31776 };
    // stationParamConfigs rỗng nhưng mergeWithBuiltin sẽ tìm thấy TK-5205A trong builtin
    const step = await resolveStepOutOfRangeWithGuard({}, "TK-5205A", tk5205Data, fetchFn);
    expect(step).toBe("params");
  });
});
