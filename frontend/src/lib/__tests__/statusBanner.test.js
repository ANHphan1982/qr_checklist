/**
 * TDD — resolveStatusBanner
 * Logic: pick the single highest-priority status banner to show.
 * Priority: coldStart > offline > sync_error (online) > sync_ok > GPS hint
 */
import { describe, it, expect } from "vitest";
import { resolveStatusBanner } from "../statusBanner.js";

const BASE = {
  isOnline: true,
  syncMsg: null,
  coldStart: false,
  gpsPermission: null,
  step: "idle",
  paramCacheCount: 5,
};

describe("resolveStatusBanner — no active state", () => {
  it("returns null when nothing is active", () => {
    expect(resolveStatusBanner(BASE)).toBeNull();
  });
});

describe("resolveStatusBanner — coldStart (highest priority)", () => {
  it("returns coldstart type when coldStart=true", () => {
    const result = resolveStatusBanner({ ...BASE, coldStart: true });
    expect(result).not.toBeNull();
    expect(result.type).toBe("coldstart");
    expect(result.variant).toBe("warning");
  });

  it("coldStart wins over offline", () => {
    const result = resolveStatusBanner({ ...BASE, coldStart: true, isOnline: false });
    expect(result.type).toBe("coldstart");
  });

  it("coldStart wins over sync_error", () => {
    const result = resolveStatusBanner({
      ...BASE,
      coldStart: true,
      syncMsg: { ok: false, text: "⚠️ Lỗi đồng bộ" },
    });
    expect(result.type).toBe("coldstart");
  });
});

describe("resolveStatusBanner — offline", () => {
  it("returns offline when not online", () => {
    const result = resolveStatusBanner({ ...BASE, isOnline: false });
    expect(result.type).toBe("offline");
    expect(result.variant).toBe("warning_secondary");
  });

  it("includes extra warning when paramCacheCount=0 and offline", () => {
    const result = resolveStatusBanner({ ...BASE, isOnline: false, paramCacheCount: 0 });
    expect(result.type).toBe("offline");
    expect(result.extra).toBeTruthy();
  });

  it("no extra warning when paramCacheCount>0 and offline", () => {
    const result = resolveStatusBanner({ ...BASE, isOnline: false, paramCacheCount: 3 });
    expect(result.type).toBe("offline");
    expect(result.extra).toBeFalsy();
  });

  it("offline wins over sync_error (error is expected when offline)", () => {
    const result = resolveStatusBanner({
      ...BASE,
      isOnline: false,
      syncMsg: { ok: false, text: "⚠️ Lỗi" },
    });
    expect(result.type).toBe("offline");
  });
});

describe("resolveStatusBanner — sync messages", () => {
  it("returns sync_error when online and syncMsg.ok=false", () => {
    const result = resolveStatusBanner({
      ...BASE,
      syncMsg: { ok: false, text: "⚠️ Lỗi đồng bộ: Timeout" },
    });
    expect(result.type).toBe("sync_error");
    expect(result.variant).toBe("error");
    expect(result.text).toContain("Lỗi");
  });

  it("returns sync_ok when online and syncMsg.ok=true", () => {
    const result = resolveStatusBanner({
      ...BASE,
      syncMsg: { ok: true, text: "📤 Đã đồng bộ 3 scan" },
    });
    expect(result.type).toBe("sync_ok");
    expect(result.variant).toBe("success");
    expect(result.text).toContain("Đã đồng bộ");
  });

  it("sync_error wins over sync_ok (error has higher priority)", () => {
    // edge case: both set simultaneously shouldn't happen, but guard anyway
    const result = resolveStatusBanner({
      ...BASE,
      syncMsg: { ok: false, text: "error" },
    });
    expect(result.type).toBe("sync_error");
  });
});

describe("resolveStatusBanner — GPS permission hint", () => {
  it("shows gps_granted when online, not busy, gpsPermission=granted", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "granted", step: "idle" });
    expect(result.type).toBe("gps_granted");
    expect(result.variant).toBe("success");
  });

  it("shows gps_prompt when gpsPermission=prompt", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "prompt", step: "idle" });
    expect(result.type).toBe("gps_prompt");
    expect(result.variant).toBe("info");
  });

  it("shows gps_denied when gpsPermission=denied", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "denied", step: "idle" });
    expect(result.type).toBe("gps_denied");
    expect(result.variant).toBe("warning");
  });

  it("shows gps_unknown when gpsPermission=unknown", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "unknown", step: "idle" });
    expect(result.type).toBe("gps_unknown");
    expect(result.variant).toBe("muted");
  });

  it("does NOT show GPS hint when step=sending (busy)", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "granted", step: "sending" });
    expect(result).toBeNull();
  });

  it("does NOT show GPS hint when step=gps (busy)", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "granted", step: "gps" });
    expect(result).toBeNull();
  });

  it("does NOT show GPS hint when step=permission (busy)", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "granted", step: "permission" });
    expect(result).toBeNull();
  });

  it("shows GPS hint during scanning step (not busy)", () => {
    // 'scanning' is not busy for the banner — GPS is already being watched
    const result = resolveStatusBanner({ ...BASE, gpsPermission: "granted", step: "scanning" });
    expect(result?.type).toBe("gps_granted");
  });

  it("does NOT show GPS hint when offline (offline banner takes precedence)", () => {
    const result = resolveStatusBanner({
      ...BASE,
      isOnline: false,
      gpsPermission: "granted",
      step: "idle",
    });
    expect(result.type).toBe("offline");
  });

  it("returns null when gpsPermission=null", () => {
    const result = resolveStatusBanner({ ...BASE, gpsPermission: null });
    expect(result).toBeNull();
  });
});
