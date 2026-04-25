/**
 * TDD — lib/torch.js
 * Hỗ trợ scan QR trong điều kiện thiếu sáng (ngoài trời ban đêm).
 *
 * API:
 *   hasTorchSupport(track) → boolean
 *   setTorch(track, on)    → Promise<boolean>  (true nếu apply thành công)
 *
 * Yêu cầu:
 *   - Không throw khi track null/undefined
 *   - Không throw khi browser không hỗ trợ getCapabilities
 *   - Không throw khi applyConstraints reject hoặc throw sync
 *     (một số device từ chối torch → không được block UI)
 */
import { describe, it, expect, vi } from "vitest";
import { hasTorchSupport, setTorch } from "../torch.js";

// ---------------------------------------------------------------------------
// hasTorchSupport
// ---------------------------------------------------------------------------

describe("hasTorchSupport", () => {
  it("returns false khi track là null", () => {
    expect(hasTorchSupport(null)).toBe(false);
  });

  it("returns false khi track là undefined", () => {
    expect(hasTorchSupport(undefined)).toBe(false);
  });

  it("returns false khi track không có hàm getCapabilities", () => {
    expect(hasTorchSupport({})).toBe(false);
  });

  it("returns false khi capabilities không có torch", () => {
    const track = { getCapabilities: () => ({ zoom: { min: 1, max: 5 } }) };
    expect(hasTorchSupport(track)).toBe(false);
  });

  it("returns false khi torch = false trong capabilities", () => {
    const track = { getCapabilities: () => ({ torch: false }) };
    expect(hasTorchSupport(track)).toBe(false);
  });

  it("returns true khi capabilities có torch = true", () => {
    const track = { getCapabilities: () => ({ torch: true }) };
    expect(hasTorchSupport(track)).toBe(true);
  });

  it("returns false khi getCapabilities throw", () => {
    const track = {
      getCapabilities: () => {
        throw new Error("not supported");
      },
    };
    expect(hasTorchSupport(track)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setTorch
// ---------------------------------------------------------------------------

describe("setTorch", () => {
  it("returns false khi track là null", async () => {
    expect(await setTorch(null, true)).toBe(false);
  });

  it("returns false khi device không hỗ trợ torch", async () => {
    const track = { getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const result = await setTorch(track, true);
    expect(result).toBe(false);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  it("gọi applyConstraints với torch:true để bật đèn", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    const result = await setTorch(track, true);
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
    expect(result).toBe(true);
  });

  it("gọi applyConstraints với torch:false để tắt đèn", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    const result = await setTorch(track, false);
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: false }],
    });
    expect(result).toBe(true);
  });

  it("ép kiểu giá trị on về boolean (truthy → true)", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    await setTorch(track, "yes");
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
  });

  it("returns false khi applyConstraints reject (device từ chối)", async () => {
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints: vi.fn().mockRejectedValue(new Error("OverconstrainedError")),
    };
    const result = await setTorch(track, true);
    expect(result).toBe(false);
  });

  it("returns false khi applyConstraints throw sync", async () => {
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints: () => {
        throw new Error("sync fail");
      },
    };
    const result = await setTorch(track, true);
    expect(result).toBe(false);
  });
});
