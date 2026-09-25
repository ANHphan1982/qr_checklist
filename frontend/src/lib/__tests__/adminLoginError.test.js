/**
 * TDD — lib/adminLoginError.js
 *
 * Covers the bug (2026-09-25): Supabase bị pause → GET /api/admin/stations trả 500,
 * nhưng LoginGate `catch {}` gộp mọi lỗi thành "Sai mật khẩu admin hoặc server lỗi".
 * Admin nhập đúng mật khẩu vẫn tưởng mình gõ sai → mất hàng giờ đoán mò.
 * Chỉ 401 mới được phép nói "sai mật khẩu".
 */
import { describe, it, expect } from "vitest";
import { adminLoginError } from "../adminLoginError.js";

// ---------------------------------------------------------------------------
// Helpers — dựng lỗi axios đúng hình dạng backend thật trả về
// ---------------------------------------------------------------------------

function makeHttpErr(status, data = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  err.request = {};
  return err;
}

function makeNetworkErr() {
  const err = new Error("Network Error");
  err.response = undefined;
  err.request = {};
  return err;
}

function makeTimeoutErr() {
  const err = new Error("timeout of 15000ms exceeded");
  err.code = "ECONNABORTED";
  err.response = undefined;
  err.request = {};
  return err;
}

// ---------------------------------------------------------------------------
// 401 — trường hợp DUY NHẤT được nói "sai mật khẩu" (admin.py:24)
// ---------------------------------------------------------------------------

describe("adminLoginError — 401 sai key", () => {
  it("returns type=wrong_key for 401", () => {
    const result = adminLoginError(makeHttpErr(401, { error: "Unauthorized" }), true);
    expect(result.type).toBe("wrong_key");
  });

  it("message nói rõ sai mật khẩu", () => {
    const result = adminLoginError(makeHttpErr(401, { error: "Unauthorized" }), true);
    expect(result.message.toLowerCase()).toMatch(/sai mật khẩu/);
  });
});

// ---------------------------------------------------------------------------
// 503 — SessionLocal is None, thiếu DATABASE_URL (admin.py:28, :41)
// ---------------------------------------------------------------------------

describe("adminLoginError — 503 database không khả dụng", () => {
  it("returns type=db_unavailable for 503", () => {
    const result = adminLoginError(makeHttpErr(503, { error: "Database không khả dụng" }), true);
    expect(result.type).toBe("db_unavailable");
  });

  it("KHÔNG được đổ lỗi cho mật khẩu khi server báo lỗi database", () => {
    const result = adminLoginError(makeHttpErr(503, { error: "Database không khả dụng" }), true);
    expect(result.message.toLowerCase()).not.toMatch(/sai mật khẩu/);
  });

  it("message nhắc tới database để biết chỗ mà sửa", () => {
    const result = adminLoginError(makeHttpErr(503, { error: "Database không khả dụng" }), true);
    expect(result.message.toLowerCase()).toMatch(/database/);
  });
});

// ---------------------------------------------------------------------------
// 500 — ADMIN_SECRET chưa cấu hình trên server (admin.py:20)
// ---------------------------------------------------------------------------

describe("adminLoginError — 500 server chưa cấu hình ADMIN_SECRET", () => {
  it("returns type=server_misconfigured khi body nói ADMIN_SECRET chưa cấu hình", () => {
    const err = makeHttpErr(500, { error: "ADMIN_SECRET chưa cấu hình trên server" });
    expect(adminLoginError(err, true).type).toBe("server_misconfigured");
  });

  it("message nhắc ADMIN_SECRET — không phải lỗi người nhập", () => {
    const err = makeHttpErr(500, { error: "ADMIN_SECRET chưa cấu hình trên server" });
    const result = adminLoginError(err, true);
    expect(result.message).toMatch(/ADMIN_SECRET/);
    expect(result.message.toLowerCase()).not.toMatch(/sai mật khẩu/);
  });
});

// ---------------------------------------------------------------------------
// 500 trần — chính là ca Supabase pause: query ném OperationalError,
// Flask trả 500 kèm body HTML (không phải JSON)
// ---------------------------------------------------------------------------

describe("adminLoginError — 500 không rõ nguyên nhân (Supabase pause)", () => {
  it("returns type=server_error cho 500 body HTML", () => {
    const err = makeHttpErr(500, "<!doctype html><title>500 Internal Server Error</title>");
    expect(adminLoginError(err, true).type).toBe("server_error");
  });

  it("KHÔNG đổ lỗi cho mật khẩu", () => {
    const err = makeHttpErr(500, "<!doctype html>");
    expect(adminLoginError(err, true).message.toLowerCase()).not.toMatch(/sai mật khẩu/);
  });

  it("gợi ý kiểm tra database — nguyên nhân thường gặp nhất của 500 ở endpoint này", () => {
    const err = makeHttpErr(500, "<!doctype html>");
    expect(adminLoginError(err, true).message.toLowerCase()).toMatch(/database/);
  });
});

// ---------------------------------------------------------------------------
// Không có HTTP response — mạng/CORS/DNS/timeout
// ---------------------------------------------------------------------------

describe("adminLoginError — không có phản hồi từ server", () => {
  it("máy mất mạng → type=offline", () => {
    expect(adminLoginError(makeNetworkErr(), false).type).toBe("offline");
  });

  it("có mạng nhưng không gọi được server → type=unreachable", () => {
    const result = adminLoginError(makeNetworkErr(), true);
    expect(result.type).toBe("unreachable");
    expect(result.message.toLowerCase()).not.toMatch(/sai mật khẩu/);
  });

  it("timeout → type=timeout, nhắc cold start Render", () => {
    const result = adminLoginError(makeTimeoutErr(), true);
    expect(result.type).toBe("timeout");
    expect(result.message.toLowerCase()).toMatch(/thử lại/);
  });
});

// ---------------------------------------------------------------------------
// Bất biến chung
// ---------------------------------------------------------------------------

describe("adminLoginError — bất biến", () => {
  it("luôn trả message không rỗng, kể cả khi err là undefined", () => {
    const result = adminLoginError(undefined, true);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("chỉ đúng 401 mới được nói 'sai mật khẩu'", () => {
    const others = [
      adminLoginError(makeHttpErr(503, {}), true),
      adminLoginError(makeHttpErr(500, {}), true),
      adminLoginError(makeNetworkErr(), true),
      adminLoginError(makeTimeoutErr(), true),
      adminLoginError(makeNetworkErr(), false),
    ];
    for (const r of others) {
      expect(r.message.toLowerCase()).not.toMatch(/sai mật khẩu/);
    }
  });
});
