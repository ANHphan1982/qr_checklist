/**
 * TDD — lib/screenDetection.js
 *
 * Phát hiện QR scan từ màn hình LCD/LED dựa trên 3 dấu hiệu:
 *   - Flicker (rolling shutter + refresh rate) → DFT 1D trên luminance series
 *   - Uniformity (màn hình phát sáng đều, giấy có gradient môi trường) → std/mean
 *   - Moiré (interference giữa pixel grid màn hình và sensor camera) → FFT 2D
 *
 * Tất cả helpers nhận object hình `{data: Uint8ClampedArray, width, height}` (giống ImageData)
 * để test mà không cần canvas thật.
 */
import { describe, it, expect, vi } from "vitest";

import {
  meanLuminance,
  meanLuminanceOfRegion,
  simpleDFT,
  findPeakInBand,
  analyzeFlicker,
  analyzeUniformity,
  analyzeMoire,
  combineScores,
  classifyScore,
  detectScreen,
  SCORE_WEIGHTS,
  CLASSIFICATION_THRESHOLDS,
} from "../screenDetection.js";

// ---------------------------------------------------------------------------
// Test helpers — synthetic image factories
// ---------------------------------------------------------------------------

/**
 * Tạo ImageData-like object (RGBA bytes).
 * fillFn(x, y) → gray value 0-255, hoặc {r,g,b}.
 */
function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fillFn(x, y);
      const r = typeof v === "number" ? v : v.r;
      const g = typeof v === "number" ? v : v.g;
      const b = typeof v === "number" ? v : v.b;
      const idx = (y * width + x) * 4;
      data[idx]     = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { data, width, height };
}

const uniformImage = (w, h, gray) => makeImage(w, h, () => gray);

const gradientImage = (w, h) =>
  makeImage(w, h, (x, y) => Math.round(((x + y) / (w + h - 2)) * 255));

// "QR-like": white background với module 8×8 đen ở giữa
const qrLikeImage = (w, h) =>
  makeImage(w, h, (x, y) => {
    const cx = w / 2, cy = h / 2;
    const inModule = Math.abs(x - cx) < 8 && Math.abs(y - cy) < 8;
    return inModule ? 0 : 240;
  });

// ---------------------------------------------------------------------------
// meanLuminance
// ---------------------------------------------------------------------------

describe("meanLuminance", () => {
  it("trả về ~0 cho ảnh đen tuyền", () => {
    const img = uniformImage(16, 16, 0);
    expect(meanLuminance(img)).toBeCloseTo(0, 1);
  });

  it("trả về ~255 cho ảnh trắng tuyền", () => {
    const img = uniformImage(16, 16, 255);
    expect(meanLuminance(img)).toBeCloseTo(255, 1);
  });

  it("trả về ~127 cho ảnh xám 127", () => {
    const img = uniformImage(16, 16, 127);
    expect(meanLuminance(img)).toBeCloseTo(127, 1);
  });

  it("dùng công thức luminance Rec.601 (R*0.299 + G*0.587 + B*0.114)", () => {
    const img = makeImage(2, 1, () => ({ r: 255, g: 0, b: 0 }));
    // Luminance = 0.299 * 255 ≈ 76
    expect(meanLuminance(img)).toBeCloseTo(76, 0);
  });
});

// ---------------------------------------------------------------------------
// meanLuminanceOfRegion
// ---------------------------------------------------------------------------

describe("meanLuminanceOfRegion", () => {
  it("trả về luminance của vùng con đúng tọa độ", () => {
    // Nửa trái đen, nửa phải trắng
    const img = makeImage(20, 10, (x) => (x < 10 ? 0 : 255));
    expect(meanLuminanceOfRegion(img, 0, 0, 10, 10)).toBeCloseTo(0, 1);   // trái
    expect(meanLuminanceOfRegion(img, 10, 0, 10, 10)).toBeCloseTo(255, 1); // phải
  });

  it("clamp tọa độ vượt biên ảnh — không throw", () => {
    const img = uniformImage(10, 10, 100);
    expect(() => meanLuminanceOfRegion(img, -5, -5, 30, 30)).not.toThrow();
    expect(meanLuminanceOfRegion(img, -5, -5, 30, 30)).toBeCloseTo(100, 1);
  });

  it("trả về 0 khi vùng trống (w=0 hoặc h=0)", () => {
    const img = uniformImage(10, 10, 100);
    expect(meanLuminanceOfRegion(img, 0, 0, 0, 5)).toBe(0);
    expect(meanLuminanceOfRegion(img, 0, 0, 5, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// simpleDFT — phân tích tần số trên series 1D
// ---------------------------------------------------------------------------

describe("simpleDFT", () => {
  it("trả về array { freq, magnitude } với độ dài N/2 + 1 (DC đến Nyquist)", () => {
    const samples = new Array(16).fill(0).map((_, i) => Math.sin(i));
    const spec = simpleDFT(samples, 33);
    expect(spec).toHaveLength(9); // 16/2 + 1 = bins 0..8
    for (const bin of spec) {
      expect(bin).toHaveProperty("freq");
      expect(bin).toHaveProperty("magnitude");
    }
  });

  it("phát hiện đúng peak ở 60Hz cho sin wave 60Hz @ fps=240", () => {
    const N = 64;
    const fps = 240;
    const samples = Array.from({ length: N }, (_, i) =>
      Math.sin(2 * Math.PI * 60 * (i / fps))
    );
    const spec = simpleDFT(samples, fps);
    // Tìm bin có magnitude lớn nhất (bỏ DC)
    let maxBin = spec[1];
    for (const bin of spec.slice(1)) {
      if (bin.magnitude > maxBin.magnitude) maxBin = bin;
    }
    expect(maxBin.freq).toBeCloseTo(60, 0);
  });

  it("DC bin (freq=0) cao khi signal có offset không đổi", () => {
    const samples = new Array(16).fill(100);
    const spec = simpleDFT(samples, 33);
    expect(spec[0].freq).toBe(0);
    expect(spec[0].magnitude).toBeGreaterThan(50);
  });

  it("magnitudes ≈ 0 ngoài DC khi signal hằng số", () => {
    const samples = new Array(16).fill(50);
    const spec = simpleDFT(samples, 33);
    for (const bin of spec.slice(1)) {
      expect(bin.magnitude).toBeLessThan(1e-6);
    }
  });

  it("không throw khi samples rỗng — trả về []", () => {
    expect(simpleDFT([], 33)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findPeakInBand
// ---------------------------------------------------------------------------

describe("findPeakInBand", () => {
  const spec = [
    { freq: 0,   magnitude: 100 },
    { freq: 10,  magnitude: 5 },
    { freq: 60,  magnitude: 50 },  // peak
    { freq: 120, magnitude: 8 },
    { freq: 180, magnitude: 3 },
  ];

  it("trả về peak có magnitude cao nhất trong band", () => {
    const peak = findPeakInBand(spec, 30, 130);
    expect(peak.freq).toBe(60);
    expect(peak.magnitude).toBe(50);
  });

  it("loại bỏ DC khi band bắt đầu > 0", () => {
    const peak = findPeakInBand(spec, 30, 200);
    expect(peak.freq).not.toBe(0);
  });

  it("trả về null khi không có bin nào trong band", () => {
    expect(findPeakInBand(spec, 1000, 2000)).toBeNull();
  });

  it("trả về null cho spectrum rỗng", () => {
    expect(findPeakInBand([], 0, 100)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// analyzeFlicker — score 0-1, cao = nghi vấn màn hình
// ---------------------------------------------------------------------------

describe("analyzeFlicker", () => {
  it("score thấp (<0.2) cho luminance series hằng số (giấy phẳng)", () => {
    const series = new Array(16).fill(150);
    const result = analyzeFlicker(series, 33);
    expect(result.score).toBeLessThan(0.2);
  });

  it("score cao (>0.6) cho sin wave biên độ ~10% mean ở tần số 60Hz", () => {
    // fps=240 (Nyquist 120Hz) — 60Hz nằm giữa band, không bị alias về 0
    // Note: sampling 60Hz tại fps=120 (đúng Nyquist) cho ra toàn 0 nên KHÔNG dùng
    const fps = 240;
    const N = 32;
    const mean = 150;
    const series = Array.from({ length: N }, (_, i) =>
      mean + 15 * Math.sin(2 * Math.PI * 60 * (i / fps))
    );
    const result = analyzeFlicker(series, fps);
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.peakFreq).toBeCloseTo(60, 0);
  });

  it("score thấp khi peak ở tần số ngoài band (vd: drift chậm 5Hz từ auto-exposure)", () => {
    // Sin wave 5Hz — drift chậm, không phải refresh flicker
    const fps = 60;
    const N = 32;
    const mean = 150;
    const series = Array.from({ length: N }, (_, i) =>
      mean + 30 * Math.sin(2 * Math.PI * 5 * (i / fps))
    );
    const result = analyzeFlicker(series, fps);
    expect(result.score).toBeLessThan(0.3);
  });

  it("trả về object với fields {score, peakFreq, peakMagnitude, cov}", () => {
    const result = analyzeFlicker([100, 110, 90, 105, 95, 100, 110, 95], 33);
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("peakFreq");
    expect(result).toHaveProperty("peakMagnitude");
    expect(result).toHaveProperty("cov");
  });

  it("score nằm trong [0, 1]", () => {
    for (const series of [
      new Array(16).fill(50),
      Array.from({ length: 16 }, (_, i) => 50 + 100 * Math.sin(i)),
      Array.from({ length: 16 }, () => Math.random() * 255),
    ]) {
      const r = analyzeFlicker(series, 33);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("score = 0 khi series quá ngắn (<8 samples) — không đủ tin cậy", () => {
    expect(analyzeFlicker([100, 100, 100], 33).score).toBe(0);
    expect(analyzeFlicker([], 33).score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeUniformity — score cao nếu vùng QR đồng đều bất thường
// ---------------------------------------------------------------------------

describe("analyzeUniformity", () => {
  it("score thấp (<0.3) cho ảnh có gradient (giấy ngoài trời)", () => {
    const img = gradientImage(64, 64);
    const result = analyzeUniformity(img, { x: 16, y: 16, w: 32, h: 32 });
    expect(result.score).toBeLessThan(0.3);
  });

  it("score cao (>0.6) khi vùng QR đồng đều cực kỳ + outside cũng đồng đều (màn hình toàn ảnh)", () => {
    // Màn hình: cả vùng QR và outside đều uniform luminance cao
    // → ratioOutsideToInside thấp NHƯNG inside CoV cũng cực thấp
    // Test chính: inside std/mean cực thấp → màn hình có background uniform
    const img = uniformImage(64, 64, 240);
    const result = analyzeUniformity(img, { x: 16, y: 16, w: 32, h: 32 });
    // CoV inside ~0 → flat phẳng (đặc trưng màn hình)
    expect(result.covInside).toBeLessThan(0.01);
    // Score cao vì uniformity hoàn hảo
    expect(result.score).toBeGreaterThan(0.6);
  });

  it("trả về object với fields {score, covInside, stdRatio, meanInside}", () => {
    const img = uniformImage(64, 64, 200);
    const result = analyzeUniformity(img, { x: 16, y: 16, w: 32, h: 32 });
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("covInside");
    expect(result).toHaveProperty("stdRatio");
    expect(result).toHaveProperty("meanInside");
  });

  it("score nằm trong [0, 1] cho mọi input hợp lệ", () => {
    const inputs = [
      uniformImage(64, 64, 0),
      uniformImage(64, 64, 255),
      gradientImage(64, 64),
      qrLikeImage(64, 64),
    ];
    for (const img of inputs) {
      const r = analyzeUniformity(img, { x: 16, y: 16, w: 32, h: 32 });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("không throw khi qrBox vượt biên ảnh", () => {
    const img = uniformImage(32, 32, 128);
    expect(() => analyzeUniformity(img, { x: -10, y: -10, w: 100, h: 100 })).not.toThrow();
  });

  it("score = 0 khi qrBox không hợp lệ (w hoặc h = 0)", () => {
    const img = uniformImage(64, 64, 200);
    expect(analyzeUniformity(img, { x: 0, y: 0, w: 0, h: 32 }).score).toBe(0);
    expect(analyzeUniformity(img, { x: 0, y: 0, w: 32, h: 0 }).score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeMoire — FFT 2D để tìm năng lượng ngoài QR fundamental band
// ---------------------------------------------------------------------------

describe("analyzeMoire", () => {
  it("score thấp (<0.3) cho ảnh uniform (không có pattern)", () => {
    const img = uniformImage(64, 64, 200);
    const result = analyzeMoire(img, { x: 0, y: 0, w: 64, h: 64 });
    expect(result.score).toBeLessThan(0.3);
  });

  it("score cao (>0.4) cho ảnh có pattern sóng cao tần (mô phỏng moiré)", () => {
    // Tạo pattern sóng vuông góc tần số trung — đặc trưng moiré
    const img = makeImage(64, 64, (x, y) =>
      Math.round(127 + 100 * Math.sin(x * 0.6) * Math.cos(y * 0.6))
    );
    const result = analyzeMoire(img, { x: 0, y: 0, w: 64, h: 64 });
    expect(result.score).toBeGreaterThan(0.4);
  });

  it("trả về object với fields {score, energyRatio}", () => {
    const img = uniformImage(64, 64, 128);
    const result = analyzeMoire(img, { x: 0, y: 0, w: 64, h: 64 });
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("energyRatio");
  });

  it("score nằm trong [0, 1]", () => {
    const inputs = [
      uniformImage(64, 64, 0),
      uniformImage(64, 64, 255),
      gradientImage(64, 64),
      qrLikeImage(64, 64),
    ];
    for (const img of inputs) {
      const r = analyzeMoire(img, { x: 0, y: 0, w: 64, h: 64 });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("không throw khi qrBox quá nhỏ (<8×8)", () => {
    const img = uniformImage(64, 64, 128);
    expect(() => analyzeMoire(img, { x: 0, y: 0, w: 4, h: 4 })).not.toThrow();
  });

  it("score = 0 cho qrBox không hợp lệ", () => {
    const img = uniformImage(64, 64, 200);
    expect(analyzeMoire(img, { x: 0, y: 0, w: 0, h: 32 }).score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// combineScores — weighted combination
// ---------------------------------------------------------------------------

describe("combineScores", () => {
  it("dùng SCORE_WEIGHTS public constants", () => {
    expect(SCORE_WEIGHTS.flicker).toBeCloseTo(0.5, 2);
    expect(SCORE_WEIGHTS.uniformity).toBeCloseTo(0.3, 2);
    expect(SCORE_WEIGHTS.moire).toBeCloseTo(0.2, 2);
    // Tổng phải bằng 1
    const sum = SCORE_WEIGHTS.flicker + SCORE_WEIGHTS.uniformity + SCORE_WEIGHTS.moire;
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("weighted sum = 0.5*F + 0.3*U + 0.2*M", () => {
    const final = combineScores({ flicker: 1.0, uniformity: 1.0, moire: 1.0 });
    expect(final).toBeCloseTo(1.0, 3);
  });

  it("trả 0 khi tất cả signals = 0", () => {
    expect(combineScores({ flicker: 0, uniformity: 0, moire: 0 })).toBe(0);
  });

  it("clamp về [0, 1]", () => {
    expect(combineScores({ flicker: 2, uniformity: 2, moire: 2 })).toBe(1);
    expect(combineScores({ flicker: -1, uniformity: -1, moire: -1 })).toBe(0);
  });

  it("xử lý signal thiếu (undefined) như 0", () => {
    const final = combineScores({ flicker: 1.0 });
    expect(final).toBeCloseTo(SCORE_WEIGHTS.flicker, 3);
  });

  it("xử lý signal NaN/null như 0", () => {
    expect(combineScores({ flicker: NaN, uniformity: null, moire: undefined })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyScore — threshold 0.5 / 0.8 (warning-only mode)
// ---------------------------------------------------------------------------

describe("classifyScore", () => {
  it("CLASSIFICATION_THRESHOLDS = { suspicious: 0.5, highRisk: 0.8 }", () => {
    expect(CLASSIFICATION_THRESHOLDS.suspicious).toBe(0.5);
    expect(CLASSIFICATION_THRESHOLDS.highRisk).toBe(0.8);
  });

  it("'clean' khi score < 0.5", () => {
    expect(classifyScore(0)).toBe("clean");
    expect(classifyScore(0.3)).toBe("clean");
    expect(classifyScore(0.499)).toBe("clean");
  });

  it("'suspicious' khi 0.5 <= score < 0.8", () => {
    expect(classifyScore(0.5)).toBe("suspicious");
    expect(classifyScore(0.7)).toBe("suspicious");
    expect(classifyScore(0.799)).toBe("suspicious");
  });

  it("'high_risk' khi score >= 0.8", () => {
    expect(classifyScore(0.8)).toBe("high_risk");
    expect(classifyScore(0.95)).toBe("high_risk");
    expect(classifyScore(1.0)).toBe("high_risk");
  });

  it("'clean' cho input không hợp lệ (NaN, undefined, null)", () => {
    expect(classifyScore(NaN)).toBe("clean");
    expect(classifyScore(undefined)).toBe("clean");
    expect(classifyScore(null)).toBe("clean");
  });
});

// ---------------------------------------------------------------------------
// detectScreen — orchestrator (uses canvas + video)
// Mock video element + canvas, kiểm tra orchestration logic
// ---------------------------------------------------------------------------

describe("detectScreen", () => {
  function mockVideoAndCanvas(luminanceFn) {
    const video = {
      videoWidth: 64,
      videoHeight: 64,
      readyState: 4, // HAVE_ENOUGH_DATA
    };

    let frameIdx = 0;
    const ctx = {
      drawImage: vi.fn(() => { frameIdx += 1; }),
      getImageData: vi.fn((x, y, w, h) => {
        const gray = luminanceFn(frameIdx);
        return makeImage(w, h, () => gray);
      }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
    };

    // Mock document.createElement('canvas')
    Object.defineProperty(globalThis, "document", {
      value: { createElement: vi.fn(() => canvas) },
      writable: true,
      configurable: true,
    });

    return { video, canvas, ctx };
  }

  it("trả về object có shape {score, signals, classification, frameCount}", async () => {
    const { video } = mockVideoAndCanvas(() => 150);
    const result = await detectScreen(video, null, { frameCount: 4, intervalMs: 1 });
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("frameCount");
    expect(result.signals).toHaveProperty("flicker");
    expect(result.signals).toHaveProperty("uniformity");
    expect(result.signals).toHaveProperty("moire");
  });

  it("classification = 'clean' cho luminance hằng số (giấy phẳng)", async () => {
    const { video } = mockVideoAndCanvas(() => 150);
    const result = await detectScreen(video, null, { frameCount: 8, intervalMs: 1 });
    expect(result.classification).toBe("clean");
  });

  it("trả về unavailable=true + score=0 khi video chưa sẵn sàng (readyState<2)", async () => {
    const result = await detectScreen(
      { videoWidth: 0, videoHeight: 0, readyState: 0 },
      null,
      { frameCount: 4, intervalMs: 1 }
    );
    expect(result.unavailable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.classification).toBe("clean");
  });

  it("dùng qrBox được truyền vào để analyze", async () => {
    const { ctx, video } = mockVideoAndCanvas(() => 150);
    await detectScreen(video, { x: 5, y: 10, w: 20, h: 20 }, { frameCount: 2, intervalMs: 1 });
    // Phải có ít nhất 1 lần getImageData được gọi
    expect(ctx.getImageData).toHaveBeenCalled();
  });

  it("không throw khi getImageData throw — trả unavailable", async () => {
    const video = { videoWidth: 64, videoHeight: 64, readyState: 4 };
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => { throw new Error("tainted canvas"); }),
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    Object.defineProperty(globalThis, "document", {
      value: { createElement: () => canvas },
      writable: true, configurable: true,
    });
    const result = await detectScreen(video, null, { frameCount: 2, intervalMs: 1 });
    expect(result.unavailable).toBe(true);
    expect(result.score).toBe(0);
  });

  it("score nằm trong [0, 1]", async () => {
    const { video } = mockVideoAndCanvas((i) => 150 + 20 * Math.sin(i));
    const result = await detectScreen(video, null, { frameCount: 8, intervalMs: 1 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
