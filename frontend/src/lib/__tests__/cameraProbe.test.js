/**
 * TDD — lib/cameraProbe.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { probeCamera, buildCameraError } from "../cameraProbe.js";
import { STATUS } from "../mdmProbes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGetUserMedia(result) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: { getUserMedia: result },
    },
    writable: true,
    configurable: true,
  });
}

function makeError(name, message = "") {
  const e = new Error(message);
  e.name = name;
  return e;
}

// ---------------------------------------------------------------------------
// probeCamera — happy path
// ---------------------------------------------------------------------------

describe("probeCamera — success", () => {
  beforeEach(() => {
    const mockStop = vi.fn();
    mockGetUserMedia(
      vi.fn().mockResolvedValue({ getTracks: () => [{ stop: mockStop }] })
    );
  });

  it("trả về PASS khi getUserMedia thành công", async () => {
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.PASS);
  });

  it("detail xác nhận camera hoạt động", async () => {
    const result = await probeCamera();
    expect(result.detail).toMatch(/hoạt động/i);
  });

  it("dừng tất cả tracks sau khi probe (tránh giữ camera)", async () => {
    const mockStop = vi.fn();
    mockGetUserMedia(
      vi.fn().mockResolvedValue({ getTracks: () => [{ stop: mockStop }] })
    );
    await probeCamera();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// probeCamera — lỗi quyền
// ---------------------------------------------------------------------------

describe("probeCamera — NotAllowedError", () => {
  it("trả về FAIL khi quyền bị từ chối", async () => {
    mockGetUserMedia(vi.fn().mockRejectedValue(makeError("NotAllowedError")));
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.FAIL);
  });

  it("detail đề cập MDM Restriction policy", async () => {
    mockGetUserMedia(vi.fn().mockRejectedValue(makeError("NotAllowedError")));
    const { detail } = await probeCamera();
    expect(detail).toMatch(/MDM.*Restriction|Allow Camera/i);
  });

  it("PermissionDeniedError được xử lý như NotAllowedError", async () => {
    mockGetUserMedia(vi.fn().mockRejectedValue(makeError("PermissionDeniedError")));
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.FAIL);
  });
});

// ---------------------------------------------------------------------------
// probeCamera — không tìm thấy thiết bị
// ---------------------------------------------------------------------------

describe("probeCamera — NotFoundError", () => {
  it("trả về FAIL khi không có camera", async () => {
    mockGetUserMedia(vi.fn().mockRejectedValue(makeError("NotFoundError")));
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.FAIL);
  });
});

// ---------------------------------------------------------------------------
// probeCamera — NotReadableError (camera đang dùng bởi app khác)
// Bug: trước đây rơi vào nhánh generic → FAIL + message không rõ
// Phải là WARN vì lỗi tạm thời, không phải MDM policy
// ---------------------------------------------------------------------------

describe("probeCamera — NotReadableError (camera bị chiếm bởi app khác)", () => {
  it("trả về WARN thay vì FAIL — lỗi tạm thời, không phải MDM policy", async () => {
    mockGetUserMedia(
      vi.fn().mockRejectedValue(makeError("NotReadableError", "Could not start video source"))
    );
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.WARN);
  });

  it("detail hướng dẫn đóng app camera khác và thử lại", async () => {
    mockGetUserMedia(
      vi.fn().mockRejectedValue(makeError("NotReadableError", "Could not start video source"))
    );
    const { detail } = await probeCamera();
    expect(detail).toMatch(/ứng dụng khác|Instagram|Zalo/i);
    expect(detail).toMatch(/đóng|thử lại/i);
  });

  it("TrackStartError (alias của NotReadableError trên một số trình duyệt) cũng là WARN", async () => {
    mockGetUserMedia(vi.fn().mockRejectedValue(makeError("TrackStartError")));
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.WARN);
  });
});

// ---------------------------------------------------------------------------
// probeCamera — getUserMedia không tồn tại
// ---------------------------------------------------------------------------

describe("probeCamera — không hỗ trợ getUserMedia", () => {
  it("FAIL khi mediaDevices không tồn tại", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
    const result = await probeCamera();
    expect(result.status).toBe(STATUS.FAIL);
    expect(result.detail).toMatch(/không hỗ trợ|HTTPS/i);
  });
});

// ---------------------------------------------------------------------------
// buildCameraError — status mapping rõ ràng
// ---------------------------------------------------------------------------

describe("buildCameraError — NotReadableError không dùng message generic", () => {
  it("không xuất hiện chuỗi 'Lỗi camera: NotReadableError'", () => {
    const msg = buildCameraError(makeError("NotReadableError", "Could not start video source"));
    expect(msg).not.toMatch(/^Lỗi camera: NotReadableError/);
  });
});
