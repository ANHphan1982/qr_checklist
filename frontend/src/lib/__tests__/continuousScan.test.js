import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowCamera,
  shouldIgnoreDuplicate,
  loadContinuousMode,
  saveContinuousMode,
  RESUME_MS,
  SAME_QR_COOLDOWN_MS,
  IDLE_TIMEOUT_MS,
  CAMERA_ALIVE_STEPS,
} from "../continuousScan.js";

describe("shouldShowCamera", () => {
  it("chế độ thường: chỉ hiện camera ở bước scanning", () => {
    expect(shouldShowCamera("scanning", false)).toBe(true);
    for (const s of ["idle", "permission", "gps", "sending", "params", "done"]) {
      expect(shouldShowCamera(s, false)).toBe(false);
    }
  });

  it("chế độ liên tục: camera sống qua gps/sending/params/done", () => {
    for (const s of CAMERA_ALIVE_STEPS) {
      expect(shouldShowCamera(s, true)).toBe(true);
    }
  });

  it("chế độ liên tục vẫn tắt camera ở idle và permission", () => {
    expect(shouldShowCamera("idle", true)).toBe(false);
    expect(shouldShowCamera("permission", true)).toBe(false);
  });
});

describe("shouldIgnoreDuplicate", () => {
  const last = { text: "TK-5211A", ts: 1_000_000 };

  it("cùng mã, còn trong cooldown → bỏ qua", () => {
    expect(shouldIgnoreDuplicate(last, "TK-5211A", 1_000_000 + 3000)).toBe(true);
  });

  it("cùng mã nhưng đã hết cooldown → chấp nhận (quét lại cố ý)", () => {
    expect(shouldIgnoreDuplicate(last, "TK-5211A", 1_000_000 + SAME_QR_COOLDOWN_MS + 1)).toBe(false);
  });

  it("đúng mốc cooldown → chấp nhận (biên không tính là trùng)", () => {
    expect(shouldIgnoreDuplicate(last, "TK-5211A", 1_000_000 + SAME_QR_COOLDOWN_MS)).toBe(false);
  });

  it("mã khác → luôn chấp nhận, kể cả ngay lập tức", () => {
    expect(shouldIgnoreDuplicate(last, "TK-5211B", 1_000_000 + 10)).toBe(false);
  });

  it("chưa có lần quét nào → chấp nhận", () => {
    expect(shouldIgnoreDuplicate(null, "TK-5211A", 1_000_000)).toBe(false);
    expect(shouldIgnoreDuplicate({}, "TK-5211A", 1_000_000)).toBe(false);
  });

  it("mốc thời gian hỏng → chấp nhận, không chặn nhầm người dùng", () => {
    expect(shouldIgnoreDuplicate({ text: "A", ts: NaN }, "A", 1000)).toBe(false);
    expect(shouldIgnoreDuplicate({ text: "A", ts: 1000 }, "A", NaN)).toBe(false);
  });

  it("cooldown tuỳ biến được tôn trọng", () => {
    expect(shouldIgnoreDuplicate(last, "TK-5211A", 1_000_000 + 500, 1000)).toBe(true);
    expect(shouldIgnoreDuplicate(last, "TK-5211A", 1_000_000 + 1500, 1000)).toBe(false);
  });
});

describe("lưu/đọc lựa chọn chế độ", () => {
  beforeEach(() => localStorage.clear());

  it("chưa từng chọn → mặc định BẬT", () => {
    expect(loadContinuousMode()).toBe(true);
  });

  it("tắt rồi đọc lại → tắt", () => {
    saveContinuousMode(false);
    expect(loadContinuousMode()).toBe(false);
  });

  it("bật lại → bật", () => {
    saveContinuousMode(false);
    saveContinuousMode(true);
    expect(loadContinuousMode()).toBe(true);
  });

  it("giá trị rác trong localStorage → coi như tắt, không crash", () => {
    localStorage.setItem("qr_continuous_scan", "xyz");
    expect(loadContinuousMode()).toBe(false);
  });
});

describe("hằng số nhịp", () => {
  it("resume đủ lâu để hạ máy nhưng vẫn ngắn hơn cooldown trùng mã", () => {
    expect(RESUME_MS).toBeGreaterThan(0);
    expect(RESUME_MS).toBeLessThan(SAME_QR_COOLDOWN_MS);
  });

  it("idle timeout dài hơn nhịp resume để không tắt camera giữa chừng", () => {
    expect(IDLE_TIMEOUT_MS).toBeGreaterThan(RESUME_MS);
  });
});
