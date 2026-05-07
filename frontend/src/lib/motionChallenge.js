/**
 * Motion Challenge — phát hiện QR scan từ màn hình dựa trên parallax.
 *
 * Khi camera dịch chuyển nhẹ:
 *   - QR thật ngoài thực tế: QR và surroundings ở độ sâu khác nhau →
 *     background shift khác tốc độ QR (parallax tự nhiên).
 *   - QR trên màn hình LCD/LED: toàn bộ nội dung màn hình nằm trên 1 mặt
 *     phẳng → QR và surroundings di chuyển đồng nhất (không parallax).
 *
 * Thuật toán:
 *   1. Thu N frames liên tiếp từ video element trong khi camera di chuyển tự nhiên.
 *   2. Với mỗi cặp frame liền kề, ước tính optical flow bằng SAD block matching:
 *        - 1 block tại trung tâm QR
 *        - 4 blocks ngay ngoài qrBox (inner surroundings)
 *   3. parallax_pair = |qrFlow - mean(bgFlows)| / |mean(bgFlows)|
 *   4. Lấy trung bình parallax_pair các cặp có đủ chuyển động.
 *   5. Parallax thấp → flat plane (màn hình) → suspicious.
 *      Parallax cao  → 3D scene (QR thật)   → clean.
 *
 * Mode: WARNING-ONLY (giống screenDetection.js).
 * Không block check-in; kết quả được thêm vào screen_signals và hiển thị trong Excel.
 */

// ---------------------------------------------------------------------------
// Public constants — tests reference these
// ---------------------------------------------------------------------------

export const MOTION_SCORE_THRESHOLDS = Object.freeze({
  suspicious: 0.5,
  highRisk: 0.8,
});

/** Relative parallax > threshold → scene coi là 3D thật, score = 0 (clean). */
export const PARALLAX_THRESHOLD_CLEAN = 0.3;

/** Background motion cần ≥ threshold này mới tính parallax cho cặp frame đó. */
export const MIN_MOTION_PX = 1.0;

/** Cần ít nhất số cặp frame hợp lệ này mới trả kết quả (không unavailable). */
export const MIN_VALID_PAIRS = 1;

// ---------------------------------------------------------------------------
// Private defaults
// ---------------------------------------------------------------------------

const BLOCK_SIZE = 12;       // Block matching size (pixels). Half = 6.
const SEARCH_RADIUS = 8;     // SAD search window ±pixels.
const DEFAULT_FRAME_COUNT = 10;
const DEFAULT_INTERVAL_MS = 50;
const BG_MARGIN_MIN = 20;    // Min pixels outside qrBox to sample bg.
const BG_MARGIN_MAX = 50;
const BG_MARGIN_FRACTION = 0.3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  if (typeof v !== "number" || Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function pixelLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/**
 * Ước tính vector chuyển động của block tại (cx, cy) từ img1 sang img2
 * bằng thuật toán SAD (Sum of Absolute Differences) block matching.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img1
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img2
 * @param {number} cx - x trung tâm block trong img1
 * @param {number} cy - y trung tâm block trong img1
 * @param {number} [blockSize=12]
 * @param {number} [searchRadius=8]
 * @returns {{dx: number, dy: number, sad: number}}
 */
export function estimateSADMotion(
  img1, img2,
  cx, cy,
  blockSize = BLOCK_SIZE,
  searchRadius = SEARCH_RADIUS
) {
  const bHalf = Math.floor(blockSize / 2);
  const { data: d1, width: W1, height: H1 } = img1;
  const { data: d2, width: W2, height: H2 } = img2;

  // Extract reference block luminances from img1
  const refPixels = [];
  for (let by = -bHalf; by <= bHalf; by++) {
    for (let bx = -bHalf; bx <= bHalf; bx++) {
      const px = cx + bx, py = cy + by;
      if (px < 0 || px >= W1 || py < 0 || py >= H1) continue;
      const off = (py * W1 + px) * 4;
      refPixels.push({ bx, by, lum: pixelLuminance(d1[off], d1[off + 1], d1[off + 2]) });
    }
  }

  if (refPixels.length === 0) return { dx: 0, dy: 0, sad: 0 };

  let bestSAD = Infinity, bestDx = 0, bestDy = 0;

  for (let sdx = -searchRadius; sdx <= searchRadius; sdx++) {
    for (let sdy = -searchRadius; sdy <= searchRadius; sdy++) {
      let sad = 0, count = 0;
      for (const { bx, by, lum: refLum } of refPixels) {
        const px2 = cx + bx + sdx, py2 = cy + by + sdy;
        if (px2 < 0 || px2 >= W2 || py2 < 0 || py2 >= H2) continue;
        const off2 = (py2 * W2 + px2) * 4;
        sad += Math.abs(refLum - pixelLuminance(d2[off2], d2[off2 + 1], d2[off2 + 2]));
        count++;
      }
      if (count > 0) {
        const normSAD = sad / count;
        if (normSAD < bestSAD) {
          bestSAD = normSAD;
          bestDx = sdx;
          bestDy = sdy;
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, sad: bestSAD === Infinity ? 0 : bestSAD };
}

/**
 * Tính parallax signal từ chuỗi frames.
 *
 * So sánh optical flow của block QR với 4 blocks surroundings ngay ngoài qrBox.
 * Parallax thấp → flat plane (màn hình). Parallax cao → 3D scene (QR thật).
 *
 * @param {Array<{data: Uint8ClampedArray, width: number, height: number}>} frames
 * @param {{x: number, y: number, w: number, h: number}|null} qrBox
 * @returns {{
 *   score: number,
 *   unavailable: boolean,
 *   validPairs: number,
 *   meanRelativeParallax: number,
 * }}
 */
export function computeParallaxSignal(frames, qrBox) {
  const fail = (reason) => ({
    score: 0,
    unavailable: true,
    validPairs: 0,
    meanRelativeParallax: 0,
    reason,
  });

  if (!frames || frames.length < 2) return fail("insufficient_frames");

  const W = frames[0].width, H = frames[0].height;
  if (W <= 0 || H <= 0) return fail("invalid_dimensions");

  const box = qrBox || {
    x: Math.floor(W * 0.15),
    y: Math.floor(H * 0.15),
    w: Math.floor(W * 0.70),
    h: Math.floor(H * 0.70),
  };

  const cx = Math.floor(box.x + box.w / 2);
  const cy = Math.floor(box.y + box.h / 2);
  const margin = clamp(
    Math.floor(Math.min(box.w, box.h) * BG_MARGIN_FRACTION),
    BG_MARGIN_MIN,
    BG_MARGIN_MAX
  );

  // 4 background sampling points just outside the qrBox
  const bgPoints = [
    { cx, cy: box.y - margin },                      // top
    { cx, cy: box.y + box.h + margin },              // bottom
    { cx: box.x - margin, cy },                      // left
    { cx: box.x + box.w + margin, cy },              // right
  ].filter(p => p.cx >= 0 && p.cx < W && p.cy >= 0 && p.cy < H);

  const relativeParallaxValues = [];

  for (let i = 0; i < frames.length - 1; i++) {
    const f1 = frames[i], f2 = frames[i + 1];

    const qrFlow = estimateSADMotion(f1, f2, cx, cy);

    let bgDxSum = 0, bgDySum = 0, bgCount = 0;
    for (const { cx: bx, cy: by } of bgPoints) {
      const flow = estimateSADMotion(f1, f2, bx, by);
      bgDxSum += flow.dx;
      bgDySum += flow.dy;
      bgCount++;
    }

    if (bgCount === 0) continue;

    const bgMeanDx = bgDxSum / bgCount;
    const bgMeanDy = bgDySum / bgCount;
    const bgMotionMag = Math.sqrt(bgMeanDx * bgMeanDx + bgMeanDy * bgMeanDy);

    if (bgMotionMag < MIN_MOTION_PX) continue;

    const parallaxDx = qrFlow.dx - bgMeanDx;
    const parallaxDy = qrFlow.dy - bgMeanDy;
    const parallaxMag = Math.sqrt(parallaxDx * parallaxDx + parallaxDy * parallaxDy);
    const relativeParallax = parallaxMag / bgMotionMag;

    relativeParallaxValues.push(relativeParallax);
  }

  if (relativeParallaxValues.length < MIN_VALID_PAIRS) {
    return fail("insufficient_motion");
  }

  const meanRelativeParallax =
    relativeParallaxValues.reduce((a, b) => a + b, 0) / relativeParallaxValues.length;

  // Low parallax → screen-like → high suspicious score
  // High parallax → real QR  → score near 0
  const score = clamp(1 - meanRelativeParallax / PARALLAX_THRESHOLD_CLEAN, 0, 1);

  return {
    score: +score.toFixed(3),
    unavailable: false,
    validPairs: relativeParallaxValues.length,
    meanRelativeParallax: +meanRelativeParallax.toFixed(3),
  };
}

/**
 * Phân loại motion score → classification string.
 *
 * @param {number|null|undefined} score
 * @returns {'clean'|'suspicious'|'high_risk'}
 */
export function classifyMotionScore(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "clean";
  if (score >= MOTION_SCORE_THRESHOLDS.highRisk) return "high_risk";
  if (score >= MOTION_SCORE_THRESHOLDS.suspicious) return "suspicious";
  return "clean";
}

// ---------------------------------------------------------------------------
// Orchestrator — async, capture từ HTMLVideoElement
// ---------------------------------------------------------------------------

/**
 * Chụp N frames từ video element và phân tích parallax signal.
 *
 * Không throw — luôn trả object hợp lệ.
 * Khi video chưa sẵn sàng hoặc camera không di chuyển đủ, trả unavailable=true
 * với score=0 (clean) để không false-positive block nhân viên hợp pháp.
 *
 * @param {HTMLVideoElement|null} video
 * @param {{x,y,w,h}|null} qrBox
 * @param {{frameCount?: number, intervalMs?: number}} opts
 * @returns {Promise<{
 *   score: number,
 *   classification: 'clean'|'suspicious'|'high_risk',
 *   validPairs: number,
 *   meanRelativeParallax: number,
 *   unavailable?: boolean,
 * }>}
 */
export async function analyzeMotionChallenge(video, qrBox = null, opts = {}) {
  const frameCount = opts.frameCount ?? DEFAULT_FRAME_COUNT;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const fail = () => ({
    score: 0,
    classification: "clean",
    validPairs: 0,
    meanRelativeParallax: 0,
    unavailable: true,
  });

  const ready =
    video &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0;
  if (!ready) return fail();

  const W = video.videoWidth, H = video.videoHeight;

  let canvas, ctx;
  try {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");
    if (!ctx) return fail();
  } catch {
    return fail();
  }

  const frames = [];
  try {
    for (let i = 0; i < frameCount; i++) {
      ctx.drawImage(video, 0, 0, W, H);
      frames.push(ctx.getImageData(0, 0, W, H));
      if (i < frameCount - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  } catch {
    return { ...fail(), frameCount: frames.length };
  }

  const result = computeParallaxSignal(frames, qrBox);

  if (result.unavailable) {
    // "Camera không di chuyển đủ" ≠ bằng chứng gian lận.
    // QR dán trên thiết bị ngoài công trường: người quét giữ yên camera → không phạt.
    // Trả score=0 (inconclusive / clean) thay vì 0.5 (suspicious).
    return {
      score: 0,
      classification: "clean",
      validPairs: 0,
      meanRelativeParallax: 0,
      unavailable: true,
      frameCount: frames.length,
    };
  }

  return {
    score: result.score,
    classification: classifyMotionScore(result.score),
    validPairs: result.validPairs,
    meanRelativeParallax: result.meanRelativeParallax,
    frameCount: frames.length,
  };
}
