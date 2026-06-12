/**
 * TDD — scannerView: logic thuần cho khung ngắm camera tự thiết kế.
 *
 * qrBoxSizeFor:      kích thước vùng quét = 85% viewport, tối đa 360px, hình vuông.
 * resolveCameraView: map trạng thái camera → cờ hiển thị UI (3 trạng thái loại trừ nhau).
 */
import { describe, it, expect } from "vitest";
import { qrBoxSizeFor, resolveCameraView } from "../scannerView.js";

describe("qrBoxSizeFor — vùng quét theo viewport", () => {
  it("màn hình nhỏ (375px) → 85% viewport", () => {
    expect(qrBoxSizeFor(375)).toEqual({ width: 319, height: 319 });
  });

  it("màn hình lớn → cap tại 360px", () => {
    expect(qrBoxSizeFor(800)).toEqual({ width: 360, height: 360 });
    expect(qrBoxSizeFor(1920)).toEqual({ width: 360, height: 360 });
  });

  it("đúng điểm giao: 85% của ~424px chạm cap 360", () => {
    expect(qrBoxSizeFor(424).width).toBe(360);
    expect(qrBoxSizeFor(423).width).toBe(360); // round(359.55) = 360
    expect(qrBoxSizeFor(422).width).toBe(359);
  });

  it("luôn là hình vuông", () => {
    for (const w of [320, 390, 414, 768, 1280]) {
      const box = qrBoxSizeFor(w);
      expect(box.width).toBe(box.height);
    }
  });
});

describe("resolveCameraView — 3 trạng thái loại trừ nhau", () => {
  it("starting → chỉ hiện spinner", () => {
    expect(resolveCameraView("starting")).toEqual({
      showSpinner: true, showScanLine: false, showError: false,
    });
  });

  it("active → chỉ hiện scan line", () => {
    expect(resolveCameraView("active")).toEqual({
      showSpinner: false, showScanLine: true, showError: false,
    });
  });

  it("failed → chỉ hiện thông báo lỗi", () => {
    expect(resolveCameraView("failed")).toEqual({
      showSpinner: false, showScanLine: false, showError: true,
    });
  });

  it("mỗi trạng thái bật đúng 1 cờ", () => {
    for (const s of ["starting", "active", "failed"]) {
      const flags = Object.values(resolveCameraView(s));
      expect(flags.filter(Boolean)).toHaveLength(1);
    }
  });
});
