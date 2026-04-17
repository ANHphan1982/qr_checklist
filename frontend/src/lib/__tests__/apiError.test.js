/**
 * TDD — lib/apiError.js
 *
 * Covers the bug: khi điện thoại có WiFi/4G nhưng server không phản hồi,
 * classifyApiError() phải phân biệt "server unreachable" vs "phone offline"
 * thay vì gộp tất cả vào "Mất kết nối".
 */
import { describe, it, expect } from "vitest";
import { classifyApiError } from "../apiError.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAxiosNetworkErr(extras = {}) {
  // axios network error: không có HTTP response (CORS, server down, DNS fail...)
  const err = new Error("Network Error");
  err.response = undefined;
  err.request = {};          // request đã gửi nhưng không nhận được response
  return Object.assign(err, extras);
}

function makeAxiosTimeoutErr() {
  const err = new Error("timeout of 90000ms exceeded");
  err.code = "ECONNABORTED";
  err.response = undefined;
  err.request = {};
  return err;
}

function makeAxiosHttpErr(status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  err.request = {};
  return err;
}

// ---------------------------------------------------------------------------
// classifyApiError — phone offline (navigator.onLine = false)
// ---------------------------------------------------------------------------

describe("classifyApiError — phone offline", () => {
  it("returns type=offline_phone when network error and phone is offline", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), false);
    expect(result.type).toBe("offline_phone");
  });

  it("message mentions mất kết nối when phone is offline", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), false);
    expect(result.message.toLowerCase()).toMatch(/mất kết nối/);
  });

  it("returns shouldQueue=true when phone offline", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), false);
    expect(result.shouldQueue).toBe(true);
  });

  it("timeout + phone offline → type=offline_phone", () => {
    const result = classifyApiError(makeAxiosTimeoutErr(), false);
    expect(result.type).toBe("offline_phone");
    expect(result.shouldQueue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyApiError — phone ONLINE nhưng server không phản hồi
// BUG HIỆN TẠI: code cũ gộp chung với "offline_phone" → misleading
// ---------------------------------------------------------------------------

describe("classifyApiError — phone online, server unreachable", () => {
  it("returns type=server_unreachable (NOT offline_phone) when phone is online", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), true);
    expect(result.type).toBe("server_unreachable");
    // Quan trọng: KHÔNG được là offline_phone khi điện thoại đang có mạng
    expect(result.type).not.toBe("offline_phone");
  });

  it("message does NOT say 'mất kết nối' khi điện thoại vẫn có mạng", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), true);
    expect(result.message.toLowerCase()).not.toMatch(/mất kết nối/);
  });

  it("message mentions server khi server unreachable", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), true);
    expect(result.message.toLowerCase()).toMatch(/server/);
  });

  it("shouldQueue=true — vẫn lưu offline để đồng bộ lại sau", () => {
    const result = classifyApiError(makeAxiosNetworkErr(), true);
    expect(result.shouldQueue).toBe(true);
  });

  it("timeout + phone online → type=server_unreachable", () => {
    const result = classifyApiError(makeAxiosTimeoutErr(), true);
    expect(result.type).toBe("server_unreachable");
    expect(result.shouldQueue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyApiError — server error (5xx)
// ---------------------------------------------------------------------------

describe("classifyApiError — 5xx server error", () => {
  it("returns type=server_error for 500", () => {
    const result = classifyApiError(makeAxiosHttpErr(500), true);
    expect(result.type).toBe("server_error");
  });

  it("returns type=server_error for 503", () => {
    const result = classifyApiError(makeAxiosHttpErr(503), true);
    expect(result.type).toBe("server_error");
  });

  it("shouldQueue=true for 5xx", () => {
    const result = classifyApiError(makeAxiosHttpErr(502), true);
    expect(result.shouldQueue).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyApiError — expected 4xx (không queue)
// ---------------------------------------------------------------------------

describe("classifyApiError — 4xx expected errors", () => {
  it("returns type=expected for 400", () => {
    const result = classifyApiError(makeAxiosHttpErr(400, { message: "Thiếu location" }), true);
    expect(result.type).toBe("expected");
  });

  it("returns type=expected for 403", () => {
    const result = classifyApiError(makeAxiosHttpErr(403, { code: "OUT_OF_RANGE" }), true);
    expect(result.type).toBe("expected");
  });

  it("shouldQueue=false for 4xx — retry không giúp được gì", () => {
    const result = classifyApiError(makeAxiosHttpErr(400), true);
    expect(result.shouldQueue).toBe(false);
  });

  it("exposes response data for 4xx", () => {
    const result = classifyApiError(makeAxiosHttpErr(403, { code: "OUT_OF_RANGE", distance: 150 }), true);
    expect(result.data?.code).toBe("OUT_OF_RANGE");
    expect(result.data?.distance).toBe(150);
  });
});
