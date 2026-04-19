/**
 * TDD — QRScanner config
 * Verify: camera sau (environment) được chọn mặc định
 */
import { describe, it, expect } from "vitest";
import { SCANNER_CONFIG } from "../QRScanner.jsx";

describe("SCANNER_CONFIG — camera sau", () => {
  it("dùng camera sau (facingMode = environment)", () => {
    expect(SCANNER_CONFIG.videoConstraints?.facingMode).toBe("environment");
  });

  it("giữ nguyên fps = 10", () => {
    expect(SCANNER_CONFIG.fps).toBe(10);
  });

  it("qrbox là object với width và height (responsive, tối đa 360px)", () => {
    expect(SCANNER_CONFIG.qrbox).toHaveProperty("width");
    expect(SCANNER_CONFIG.qrbox).toHaveProperty("height");
    expect(SCANNER_CONFIG.qrbox.width).toBeLessThanOrEqual(360);
    expect(SCANNER_CONFIG.qrbox.height).toBeLessThanOrEqual(360);
  });
});
