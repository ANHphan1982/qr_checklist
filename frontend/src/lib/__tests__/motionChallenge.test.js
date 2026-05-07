/**
 * TDD — lib/motionChallenge.js
 *
 * Phát hiện QR scan từ màn hình dựa trên parallax khi camera di chuyển.
 *
 * Khi camera dịch chuyển nhẹ:
 *   - QR thật: QR và surroundings ở độ sâu khác nhau → parallax tự nhiên
 *   - QR màn hình: toàn bộ mặt phẳng màn hình di chuyển đồng nhất → không parallax
 *
 * Các functions được test:
 *   - estimateSADMotion     : block matching SAD, ước tính optical flow
 *   - computeParallaxSignal : tính parallax từ chuỗi frames
 *   - classifyMotionScore   : phân loại score → clean/suspicious/high_risk
 *   - analyzeMotionChallenge: orchestrator async (mock video element)
 */
import { describe, it, expect, vi } from "vitest";

import {
  estimateSADMotion,
  computeParallaxSignal,
  classifyMotionScore,
  analyzeMotionChallenge,
  MOTION_SCORE_THRESHOLDS,
  MIN_MOTION_PX,
  MIN_VALID_PAIRS,
  PARALLAX_THRESHOLD_CLEAN,
} from "../motionChallenge.js";

// ---------------------------------------------------------------------------
// Helpers — synthetic image factories
// ---------------------------------------------------------------------------

function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gray = fillFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Shift image content by (dx, dy); fill out-of-bounds with gray=128. */
function shiftImage(img, dx, dy) {
  const { data, width, height } = img;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - dx, sy = y - dy;
      const i = (y * width + x) * 4;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const si = (sy * width + sx) * 4;
        out[i] = data[si];
        out[i + 1] = data[si + 1];
        out[i + 2] = data[si + 2];
        out[i + 3] = 255;
      } else {
        out[i] = out[i + 1] = out[i + 2] = 128;
        out[i + 3] = 255;
      }
    }
  }
  return { data: out, width, height };
}

/**
 * Position-based hash image — has texture, no sequential periodicity.
 * Using a position-based hash avoids the period-256 issue of sequential LCG.
 */
function makeRandomImage(width, height, seed = 42) {
  return makeImage(width, height, (x, y) => {
    // Avalanche-style mix to avoid any short-period patterns per row/column
    let h = ((x * 374761393) ^ (y * 668265263) ^ (seed * 2246822519)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = ((h * 1274126177) >>> 0);
    h = (h ^ (h >>> 16)) >>> 0;
    return h & 0xff;
  });
}

/**
 * Build a frame sequence simulating parallax motion:
 *   - QR region moves by qrShiftPerFrame pixels each frame
 *   - Background moves by bgShiftPerFrame pixels each frame
 * Both shifts are horizontal (dx only, dy=0).
 */
function makeParallaxFrameSet(width, height, qrBox, numFrames, qrShiftPerFrame, bgShiftPerFrame, seed) {
  const base = makeRandomImage(width, height, seed);
  const frames = [base];
  for (let i = 1; i < numFrames; i++) {
    const totalQrShift = i * qrShiftPerFrame;
    const totalBgShift = i * bgShiftPerFrame;
    const frame = makeImage(width, height, (x, y) => {
      const inQr = x >= qrBox.x && x < qrBox.x + qrBox.w &&
                   y >= qrBox.y && y < qrBox.y + qrBox.h;
      const shift = inQr ? totalQrShift : totalBgShift;
      const sx = x - shift;
      if (sx >= 0 && sx < width) return base.data[(y * width + sx) * 4];
      return 128;
    });
    frames.push(frame);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// estimateSADMotion
// ---------------------------------------------------------------------------

describe("estimateSADMotion", () => {
  it("detects exact horizontal shift", () => {
    const img1 = makeRandomImage(100, 100, 7);
    const img2 = shiftImage(img1, 4, 0);
    const result = estimateSADMotion(img1, img2, 50, 50, 12, 8);
    expect(result.dx).toBe(4);
    expect(result.dy).toBe(0);
    expect(result.sad).toBe(0);
  });

  it("detects exact vertical shift", () => {
    const img1 = makeRandomImage(100, 100, 11);
    const img2 = shiftImage(img1, 0, 5);
    const result = estimateSADMotion(img1, img2, 50, 50, 12, 8);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(5);
  });

  it("detects exact diagonal shift", () => {
    const img1 = makeRandomImage(100, 100, 13);
    const img2 = shiftImage(img1, 3, -3);
    const result = estimateSADMotion(img1, img2, 50, 50, 12, 8);
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(-3);
  });

  it("returns (0, 0) for identical images", () => {
    const img = makeRandomImage(100, 100, 5);
    const result = estimateSADMotion(img, img, 50, 50, 12, 8);
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.sad).toBe(0);
  });

  it("returns finite non-negative sad", () => {
    const img1 = makeRandomImage(80, 80, 3);
    const img2 = shiftImage(img1, 2, 1);
    const result = estimateSADMotion(img1, img2, 40, 40, 8, 4);
    expect(Number.isFinite(result.sad)).toBe(true);
    expect(result.sad).toBeGreaterThanOrEqual(0);
  });

  it("handles block near image border without throwing", () => {
    const img1 = makeRandomImage(80, 80, 11);
    const img2 = shiftImage(img1, 2, 2);
    const result = estimateSADMotion(img1, img2, 5, 5, 12, 4);
    expect(typeof result.dx).toBe("number");
    expect(typeof result.dy).toBe("number");
    expect(typeof result.sad).toBe("number");
  });

  it("uses default blockSize and searchRadius when omitted", () => {
    const img1 = makeRandomImage(100, 100, 17);
    const img2 = shiftImage(img1, 3, 0);
    const result = estimateSADMotion(img1, img2, 50, 50);
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeParallaxSignal
// ---------------------------------------------------------------------------

describe("computeParallaxSignal", () => {
  const W = 200, H = 200;
  const qrBox = { x: 70, y: 70, w: 60, h: 60 };

  it("returns unavailable when fewer than 2 frames provided", () => {
    const img = makeRandomImage(W, H, 1);
    const result = computeParallaxSignal([img], qrBox);
    expect(result.unavailable).toBe(true);
    expect(result.score).toBe(0);
  });

  it("returns unavailable when empty frames array", () => {
    const result = computeParallaxSignal([], qrBox);
    expect(result.unavailable).toBe(true);
  });

  it("returns unavailable when camera barely moves (all pairs skipped)", () => {
    // Identical frames → all block motions ≈ 0 → below MIN_MOTION_PX
    const img = makeRandomImage(W, H, 1);
    const frames = [img, img, img, img];
    const result = computeParallaxSignal(frames, qrBox);
    expect(result.unavailable).toBe(true);
    expect(result.validPairs).toBe(0);
  });

  it("flat plane (uniform translation) → high screen score", () => {
    // Simulate screen: entire frame shifts uniformly each step
    // QR and background move IDENTICALLY → parallax ≈ 0 → screen score high
    const base = makeRandomImage(W, H, 99);
    const frames = [
      base,
      shiftImage(base, 2, 0),
      shiftImage(base, 4, 0),
      shiftImage(base, 6, 0),
    ];
    const result = computeParallaxSignal(frames, qrBox);
    expect(result.unavailable).toBe(false);
    // Flat plane → low parallax → score near 1.0
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.meanRelativeParallax).toBeLessThan(0.1);
  });

  it("parallax scene (QR moves more than background) → low screen score", () => {
    // Simulate real QR: QR shifts 6px/frame, background shifts 2px/frame
    const frames = makeParallaxFrameSet(W, H, qrBox, 4, 6, 2, 42);
    const result = computeParallaxSignal(frames, qrBox);
    expect(result.unavailable).toBe(false);
    // High parallax → score near 0 (clean)
    expect(result.score).toBeLessThan(0.3);
    expect(result.meanRelativeParallax).toBeGreaterThan(PARALLAX_THRESHOLD_CLEAN);
  });

  it("returns validPairs count in result", () => {
    const base = makeRandomImage(W, H, 55);
    const frames = [
      base,
      shiftImage(base, 3, 0),
      shiftImage(base, 6, 0),
      shiftImage(base, 9, 0),
    ];
    const result = computeParallaxSignal(frames, qrBox);
    if (!result.unavailable) {
      expect(result.validPairs).toBeGreaterThanOrEqual(MIN_VALID_PAIRS);
    }
  });

  it("uses default qrBox (full frame center) when qrBox is null", () => {
    const img1 = makeRandomImage(W, H, 7);
    const img2 = shiftImage(img1, 3, 0);
    const result = computeParallaxSignal([img1, img2], null);
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("unavailable");
    expect(typeof result.score).toBe("number");
  });

  it("score is clamped to [0, 1]", () => {
    const base = makeRandomImage(W, H, 3);
    const frames = makeParallaxFrameSet(W, H, qrBox, 4, 8, 1, 3);
    const result = computeParallaxSignal(frames, qrBox);
    if (!result.unavailable) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// classifyMotionScore
// ---------------------------------------------------------------------------

describe("classifyMotionScore", () => {
  it("score 0 → clean", () => {
    expect(classifyMotionScore(0)).toBe("clean");
  });

  it("score below suspicious threshold → clean", () => {
    expect(classifyMotionScore(MOTION_SCORE_THRESHOLDS.suspicious - 0.01)).toBe("clean");
  });

  it("score exactly at suspicious threshold → suspicious", () => {
    expect(classifyMotionScore(MOTION_SCORE_THRESHOLDS.suspicious)).toBe("suspicious");
  });

  it("score between thresholds → suspicious", () => {
    expect(classifyMotionScore(0.65)).toBe("suspicious");
  });

  it("score exactly at highRisk threshold → high_risk", () => {
    expect(classifyMotionScore(MOTION_SCORE_THRESHOLDS.highRisk)).toBe("high_risk");
  });

  it("score 1.0 → high_risk", () => {
    expect(classifyMotionScore(1.0)).toBe("high_risk");
  });

  it("NaN → clean (defensive)", () => {
    expect(classifyMotionScore(NaN)).toBe("clean");
  });

  it("null → clean (defensive)", () => {
    expect(classifyMotionScore(null)).toBe("clean");
  });

  it("undefined → clean (defensive)", () => {
    expect(classifyMotionScore(undefined)).toBe("clean");
  });

  it("string → clean (defensive)", () => {
    expect(classifyMotionScore("high")).toBe("clean");
  });
});

// ---------------------------------------------------------------------------
// analyzeMotionChallenge — orchestrator (mock video)
// ---------------------------------------------------------------------------

describe("analyzeMotionChallenge", () => {
  it("returns unavailable when video is null", async () => {
    const result = await analyzeMotionChallenge(null, null);
    expect(result.unavailable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.classification).toBe("clean");
  });

  it("returns unavailable when video readyState < 2", async () => {
    const fakeVideo = { readyState: 1, videoWidth: 0, videoHeight: 0 };
    const result = await analyzeMotionChallenge(fakeVideo, null);
    expect(result.unavailable).toBe(true);
    expect(result.score).toBe(0);
  });

  it("returns unavailable when video dimensions are zero", async () => {
    const fakeVideo = { readyState: 4, videoWidth: 0, videoHeight: 0 };
    const result = await analyzeMotionChallenge(fakeVideo, null);
    expect(result.unavailable).toBe(true);
  });

  it("returns valid result shape when video is ready (mocked canvas)", async () => {
    const W = 80, H = 80;
    let frameIdx = 0;
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        // Return slightly different random image each call to simulate motion
        frameIdx++;
        return makeRandomImage(W, H, frameIdx * 7);
      }),
    };
    const mockCanvas = { width: 0, height: 0, getContext: () => mockCtx };
    vi.stubGlobal("document", { createElement: () => mockCanvas });

    const mockVideo = { readyState: 4, videoWidth: W, videoHeight: H };
    const result = await analyzeMotionChallenge(mockVideo, null, {
      frameCount: 4,
      intervalMs: 1,
    });

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("validPairs");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(["clean", "suspicious", "high_risk"]).toContain(result.classification);

    vi.unstubAllGlobals();
  });

  it("does not throw when canvas.getContext returns null", async () => {
    const mockCanvas = { width: 0, height: 0, getContext: () => null };
    vi.stubGlobal("document", { createElement: () => mockCanvas });

    const mockVideo = { readyState: 4, videoWidth: 80, videoHeight: 80 };
    const result = await analyzeMotionChallenge(mockVideo, null, { frameCount: 4, intervalMs: 1 });
    expect(result.unavailable).toBe(true);

    vi.unstubAllGlobals();
  });

  it("does not throw when getImageData throws (tainted canvas)", async () => {
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => { throw new Error("tainted"); }),
    };
    const mockCanvas = { width: 0, height: 0, getContext: () => mockCtx };
    vi.stubGlobal("document", { createElement: () => mockCanvas });

    const mockVideo = { readyState: 4, videoWidth: 80, videoHeight: 80 };
    const result = await analyzeMotionChallenge(mockVideo, null, { frameCount: 4, intervalMs: 1 });
    expect(result.unavailable).toBe(true);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("MOTION_SCORE_THRESHOLDS has suspicious and highRisk", () => {
    expect(MOTION_SCORE_THRESHOLDS.suspicious).toBeGreaterThan(0);
    expect(MOTION_SCORE_THRESHOLDS.highRisk).toBeGreaterThan(MOTION_SCORE_THRESHOLDS.suspicious);
    expect(MOTION_SCORE_THRESHOLDS.highRisk).toBeLessThanOrEqual(1);
  });

  it("MIN_MOTION_PX is positive", () => {
    expect(MIN_MOTION_PX).toBeGreaterThan(0);
  });

  it("MIN_VALID_PAIRS is at least 1", () => {
    expect(MIN_VALID_PAIRS).toBeGreaterThanOrEqual(1);
  });

  it("PARALLAX_THRESHOLD_CLEAN is positive", () => {
    expect(PARALLAX_THRESHOLD_CLEAN).toBeGreaterThan(0);
  });
});
