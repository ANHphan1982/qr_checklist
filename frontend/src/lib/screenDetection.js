/**
 * Phát hiện QR scan từ màn hình LCD/LED dựa trên 3 dấu hiệu vật lý:
 *
 *   A. Flicker     — Camera điện thoại có rolling shutter; refresh rate màn hình
 *                    tạo dao động chu kỳ trên trung bình luminance giữa các frame.
 *                    Đo bằng DFT 1D trên series luminance, peak trong band tần số
 *                    refresh-related (relative theo fps capture, vì 30fps aliases
 *                    60Hz về 0 nên không cố định 50-130Hz).
 *
 *   B. Uniformity  — Màn hình tự phát sáng → background QR cực kỳ phẳng (CoV ~0).
 *                    Giấy phản xạ ánh sáng môi trường → background có gradient/noise
 *                    nhẹ. Đo std/mean trong vùng QR + tỉ lệ std outside/inside.
 *
 *   C. Moiré       — Pixel grid màn hình giao thoa với pixel grid sensor camera →
 *                    pattern có energy ở mid-frequency band trên FFT 2D. Giấy in
 *                    không có energy ở band này.
 *
 * Mode hoạt động: WARNING-ONLY.
 *   - score < 0.5  → 'clean'      (không cảnh báo)
 *   - score 0.5-0.8 → 'suspicious' (đánh dấu DB + email cảnh báo nhẹ)
 *   - score >= 0.8 → 'high_risk'  (đánh dấu DB + email cảnh báo mạnh)
 *
 * KHÔNG BLOCK check-in. Quyết định cho thiết kế này:
 *   - False positive cho giấy laminated/glossy dưới đèn LED là không tránh được.
 *   - Block sẽ chặn nhân viên hợp pháp → admin phải ngồi tay điều chỉnh.
 *   - Warning + log + dashboard cho phép admin tự xác minh từng case.
 */

// ---------------------------------------------------------------------------
// Public constants — tests và backend reference các giá trị này
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = Object.freeze({
  flicker: 0.5,    // Tín hiệu mạnh nhất trên monitor PC (đúng kịch bản chính)
  uniformity: 0.3, // Bổ trợ cho OLED nơi flicker yếu
  moire: 0.2,      // Phụ thuộc khoảng cách + góc, không reliable đơn lẻ
});

export const CLASSIFICATION_THRESHOLDS = Object.freeze({
  suspicious: 0.5,
  highRisk: 0.8,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  if (typeof v !== "number" || Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// Rec.601 luminance — match human eye sensitivity (đầy đủ hơn (R+G+B)/3)
function pixelLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// ---------------------------------------------------------------------------
// Image helpers — nhận object { data: Uint8ClampedArray, width, height }
// ---------------------------------------------------------------------------

export function meanLuminance(img) {
  if (!img || !img.data || img.width <= 0 || img.height <= 0) return 0;
  const { data, width, height } = img;
  let sum = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    sum += pixelLuminance(data[off], data[off + 1], data[off + 2]);
  }
  return sum / n;
}

export function meanLuminanceOfRegion(img, x, y, w, h) {
  if (w <= 0 || h <= 0) return 0;
  if (!img || !img.data || img.width <= 0 || img.height <= 0) return 0;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.floor(x + w));
  const y1 = Math.min(img.height, Math.floor(y + h));
  if (x1 <= x0 || y1 <= y0) return 0;
  const { data, width } = img;
  let sum = 0;
  let count = 0;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const off = (yy * width + xx) * 4;
      sum += pixelLuminance(data[off], data[off + 1], data[off + 2]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function regionStats(img, x, y, w, h) {
  const empty = { count: 0, mean: 0, std: 0 };
  if (w <= 0 || h <= 0) return empty;
  if (!img || !img.data) return empty;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.floor(x + w));
  const y1 = Math.min(img.height, Math.floor(y + h));
  if (x1 <= x0 || y1 <= y0) return empty;

  const { data, width } = img;
  // Welford's online algorithm — single pass, numerically stable
  let count = 0, mean = 0, m2 = 0;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const off = (yy * width + xx) * 4;
      const L = pixelLuminance(data[off], data[off + 1], data[off + 2]);
      count++;
      const delta = L - mean;
      mean += delta / count;
      m2 += delta * (L - mean);
    }
  }
  const std = count > 0 ? Math.sqrt(m2 / count) : 0;
  return { count, mean, std };
}

// ---------------------------------------------------------------------------
// DFT 1D — Naive O(N²). N typically 12-16 frames → fast enough.
// ---------------------------------------------------------------------------

export function simpleDFT(samples, sampleRate) {
  if (!samples || samples.length === 0) return [];
  const N = samples.length;
  const half = Math.floor(N / 2);
  const result = [];
  for (let k = 0; k <= half; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phase = (-2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(phase);
      im += samples[n] * Math.sin(phase);
    }
    // DC bin = mean (chia N). AC bins = peak amplitude (2*|F[k]|/N).
    const magnitude =
      k === 0
        ? Math.abs(re) / N
        : (2 * Math.sqrt(re * re + im * im)) / N;
    const freq = (k * sampleRate) / N;
    result.push({ freq, magnitude });
  }
  return result;
}

export function findPeakInBand(spectrum, minFreq, maxFreq) {
  let peak = null;
  for (const bin of spectrum) {
    if (bin.freq < minFreq || bin.freq > maxFreq) continue;
    if (!peak || bin.magnitude > peak.magnitude) peak = bin;
  }
  return peak;
}

// ---------------------------------------------------------------------------
// FFT 2D — separable (row + col DFT), magnitude only
// ---------------------------------------------------------------------------

function dft1dComplex(reIn, imIn) {
  const N = reIn.length;
  const reOut = new Array(N);
  const imOut = new Array(N);
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phase = (-2 * Math.PI * k * n) / N;
      const c = Math.cos(phase);
      const s = Math.sin(phase);
      const xr = reIn[n];
      const xi = imIn ? imIn[n] : 0;
      re += xr * c - xi * s;
      im += xr * s + xi * c;
    }
    reOut[k] = re;
    imOut[k] = im;
  }
  return { re: reOut, im: imOut };
}

function fft2dMagnitude(matrix) {
  const H = matrix.length;
  const W = matrix[0].length;
  // Row pass
  const rowsRe = new Array(H);
  const rowsIm = new Array(H);
  for (let y = 0; y < H; y++) {
    const { re, im } = dft1dComplex(matrix[y], null);
    rowsRe[y] = re;
    rowsIm[y] = im;
  }
  // Column pass
  const out = new Array(H);
  for (let y = 0; y < H; y++) out[y] = new Float32Array(W);

  const colRe = new Array(H);
  const colIm = new Array(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      colRe[y] = rowsRe[y][x];
      colIm[y] = rowsIm[y][x];
    }
    const { re, im } = dft1dComplex(colRe, colIm);
    for (let y = 0; y < H; y++) {
      out[y][x] = Math.sqrt(re[y] * re[y] + im[y] * im[y]);
    }
  }
  return out;
}

function downsampleAndCenter(img, qrBox, targetSize) {
  const x0 = Math.max(0, Math.floor(qrBox.x));
  const y0 = Math.max(0, Math.floor(qrBox.y));
  const x1 = Math.min(img.width, Math.floor(qrBox.x + qrBox.w));
  const y1 = Math.min(img.height, Math.floor(qrBox.y + qrBox.h));
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW <= 0 || cropH <= 0) return null;

  const matrix = new Array(targetSize);
  // Pass 1: bilinear-ish nearest neighbor downsample, accumulate mean
  let sum = 0;
  for (let yy = 0; yy < targetSize; yy++) {
    matrix[yy] = new Array(targetSize);
    const sy = y0 + Math.floor((yy * cropH) / targetSize);
    for (let xx = 0; xx < targetSize; xx++) {
      const sx = x0 + Math.floor((xx * cropW) / targetSize);
      const off = (sy * img.width + sx) * 4;
      const L = pixelLuminance(img.data[off], img.data[off + 1], img.data[off + 2]);
      matrix[yy][xx] = L;
      sum += L;
    }
  }
  // Pass 2: center (subtract mean) — loại bỏ DC khỏi FFT
  const mean = sum / (targetSize * targetSize);
  for (let yy = 0; yy < targetSize; yy++) {
    for (let xx = 0; xx < targetSize; xx++) {
      matrix[yy][xx] -= mean;
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Analyzers
// ---------------------------------------------------------------------------

/**
 * @param {number[]} luminances - mean luminance per frame
 * @param {number} fps - capture frame rate (frames per second)
 * @returns {{score: number, peakFreq: number, peakMagnitude: number, cov: number}}
 *
 * Note on band: band tần số là RELATIVE theo fps. 30fps capture aliases 60Hz về 0 →
 * không thể cố định band 50-130Hz. Dùng max(5, 0.15*fps) đến Nyquist để bắt cả
 * aliased peaks (vd 75Hz màn hình aliased về 15Hz khi fps=30).
 */
export function analyzeFlicker(luminances, fps) {
  const empty = { score: 0, peakFreq: 0, peakMagnitude: 0, cov: 0 };
  if (!luminances || luminances.length < 8) return empty;
  if (!fps || fps <= 0) return empty;

  const spec = simpleDFT(luminances, fps);
  const minFreq = Math.max(5, 0.15 * fps);
  const maxFreq = fps / 2;
  const peak = findPeakInBand(spec, minFreq, maxFreq);
  if (!peak) return empty;

  const dc = spec[0]?.magnitude || 1;
  const cov = peak.magnitude / dc;
  // CoV ≥ 0.10 (10%) → score 1.0 (chắc chắn flicker mạnh)
  // CoV ≤ 0.01 (1%)  → score 0.1
  const score = clamp(cov / 0.10, 0, 1);
  return { score, peakFreq: peak.freq, peakMagnitude: peak.magnitude, cov };
}

/**
 * @returns {{score: number, covInside: number, stdRatio: number, meanInside: number}}
 *
 * Hai tín hiệu phụ:
 *   - flatScore: covInside thấp → background QR phẳng → đặc trưng màn hình
 *   - ratioScore: stdOutside/stdInside cao → môi trường outside có ánh sáng/shadow
 *                 còn QR vẫn phẳng (đèn nền màn hình át đi)
 */
export function analyzeUniformity(img, qrBox) {
  const empty = { score: 0, covInside: 0, stdRatio: 0, meanInside: 0 };
  if (!qrBox || qrBox.w <= 0 || qrBox.h <= 0) return empty;
  if (!img) return empty;

  const inside = regionStats(img, qrBox.x, qrBox.y, qrBox.w, qrBox.h);
  if (inside.count === 0) return empty;

  // Outside ring 20px around qrBox
  const ring = 20;
  const top   = regionStats(img, qrBox.x - ring, qrBox.y - ring,        qrBox.w + 2 * ring, ring);
  const bot   = regionStats(img, qrBox.x - ring, qrBox.y + qrBox.h,     qrBox.w + 2 * ring, ring);
  const left  = regionStats(img, qrBox.x - ring, qrBox.y,               ring, qrBox.h);
  const right = regionStats(img, qrBox.x + qrBox.w, qrBox.y,            ring, qrBox.h);

  // Combined outside std (pooled mean + variance decomposition)
  let outCount = 0;
  let outMeanWeighted = 0;
  for (const r of [top, bot, left, right]) {
    outCount += r.count;
    outMeanWeighted += r.mean * r.count;
  }
  let outsideStd = 0;
  if (outCount > 0) {
    const outMean = outMeanWeighted / outCount;
    let varSum = 0;
    for (const r of [top, bot, left, right]) {
      if (r.count > 0) {
        varSum += r.count * (r.std * r.std + (r.mean - outMean) ** 2);
      }
    }
    outsideStd = Math.sqrt(varSum / outCount);
  }

  const covInside = inside.mean > 0 ? inside.std / inside.mean : 0;
  // Floor to avoid div-by-near-zero spike when both regions are uniform
  const stdInsideFloor = Math.max(inside.std, 1.0);
  const stdRatio = outsideStd / stdInsideFloor;

  // covInside <= 0.005 → flatScore 1.0; covInside >= 0.025 → flatScore 0
  const flatScore = clamp(1 - covInside / 0.02, 0, 1);
  // stdRatio >= 4 → ratioScore 1.0; stdRatio <= 1 → 0
  const ratioScore = clamp((stdRatio - 1) / 3, 0, 1);
  const score = 0.7 * flatScore + 0.3 * ratioScore;
  return { score, covInside, stdRatio, meanInside: inside.mean };
}

/**
 * @returns {{score: number, energyRatio: number}}
 *
 * Đo tỉ lệ năng lượng trong "moiré band" (tần số trung 0.05-0.40 cycle/pixel)
 * trên FFT 2D đã downsample 32×32. Pattern moiré tạo peaks rõ trong band này
 * trong khi giấy in trơn không.
 */
export function analyzeMoire(img, qrBox) {
  const empty = { score: 0, energyRatio: 0 };
  if (!qrBox || qrBox.w <= 0 || qrBox.h <= 0) return empty;
  if (!img) return empty;

  const target = 32;
  const matrix = downsampleAndCenter(img, qrBox, target);
  if (!matrix) return empty;

  const spec = fft2dMagnitude(matrix);
  const N = target;

  // Frequency bands (cycle/pixel):
  //   Skip:        fr < 0.04         (DC + slow gradients)
  //   Skip:        fr > 0.45         (high freq noise, beyond useful range)
  //   Moiré band:  0.05 <= fr <= 0.40
  let totalE = 0;
  let moireE = 0;
  const minSkip = 0.04;
  const maxSkip = 0.45;
  const minBand = 0.05;
  const maxBand = 0.40;

  for (let ky = 0; ky < N; ky++) {
    const fy = (ky < N / 2 ? ky : ky - N) / N;
    for (let kx = 0; kx < N; kx++) {
      const fx = (kx < N / 2 ? kx : kx - N) / N;
      const fr = Math.sqrt(fx * fx + fy * fy);
      if (fr < minSkip || fr > maxSkip) continue;
      const m = spec[ky][kx];
      totalE += m;
      if (fr >= minBand && fr <= maxBand) moireE += m;
    }
  }
  const energyRatio = totalE > 0 ? moireE / totalE : 0;
  // energyRatio >= 0.35 → score 1.0 (mạnh)
  // energyRatio <= 0.05 → score 0
  const score = clamp((energyRatio - 0.05) / 0.30, 0, 1);
  return { score, energyRatio };
}

// ---------------------------------------------------------------------------
// Combine + classify
// ---------------------------------------------------------------------------

function safeNum(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

export function combineScores(signals = {}) {
  const f = clamp(safeNum(signals.flicker), 0, 1);
  const u = clamp(safeNum(signals.uniformity), 0, 1);
  const m = clamp(safeNum(signals.moire), 0, 1);
  const total =
    SCORE_WEIGHTS.flicker * f +
    SCORE_WEIGHTS.uniformity * u +
    SCORE_WEIGHTS.moire * m;
  return clamp(total, 0, 1);
}

export function classifyScore(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "clean";
  if (score >= CLASSIFICATION_THRESHOLDS.highRisk) return "high_risk";
  if (score >= CLASSIFICATION_THRESHOLDS.suspicious) return "suspicious";
  return "clean";
}

// ---------------------------------------------------------------------------
// Orchestrator — capture + analyze
// ---------------------------------------------------------------------------

const DEFAULT_FRAME_COUNT = 12;
const DEFAULT_INTERVAL_MS = 30; // ~33fps capture rate

/**
 * @param {HTMLVideoElement} video — video element đang phát stream camera
 * @param {{x,y,w,h}|null} qrBox — bounding box QR. null → giả định 70% giữa frame.
 * @param {{frameCount?: number, intervalMs?: number}} opts
 * @returns {Promise<{
 *   score: number,
 *   classification: 'clean'|'suspicious'|'high_risk',
 *   signals: {flicker: number, uniformity: number, moire: number},
 *   frameCount: number,
 *   unavailable?: boolean,
 * }>}
 *
 * Không throw — luôn trả object hợp lệ. Khi video không sẵn sàng hoặc canvas
 * tainted (cross-origin video), trả unavailable=true với score=0 (clean).
 */
export async function detectScreen(video, qrBox = null, opts = {}) {
  const frameCount = opts.frameCount ?? DEFAULT_FRAME_COUNT;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const fail = () => ({
    score: 0,
    classification: "clean",
    signals: { flicker: 0, uniformity: 0, moire: 0 },
    frameCount: 0,
    unavailable: true,
  });

  const ready =
    video &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0;
  if (!ready) return fail();

  const W = video.videoWidth;
  const H = video.videoHeight;
  const box = qrBox || {
    x: Math.floor(W * 0.15),
    y: Math.floor(H * 0.15),
    w: Math.floor(W * 0.70),
    h: Math.floor(H * 0.70),
  };

  let canvas;
  let ctx;
  try {
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d");
    if (!ctx) return fail();
  } catch {
    return fail();
  }

  const luminances = [];
  let midFrameImg = null;
  const midIdx = Math.floor(frameCount / 2);

  try {
    for (let i = 0; i < frameCount; i++) {
      ctx.drawImage(video, 0, 0, W, H);
      const fullImg = ctx.getImageData(0, 0, W, H);
      luminances.push(meanLuminanceOfRegion(fullImg, box.x, box.y, box.w, box.h));
      if (i === midIdx) midFrameImg = fullImg;
      if (i < frameCount - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
  } catch {
    // Tainted canvas (cross-origin) hoặc lỗi khác → bỏ qua, trả unavailable
    return { ...fail(), frameCount: luminances.length };
  }

  const fps = 1000 / intervalMs;
  const flickerR = analyzeFlicker(luminances, fps);

  let uniformityR = { score: 0 };
  let moireR = { score: 0 };
  if (midFrameImg) {
    uniformityR = analyzeUniformity(midFrameImg, box);
    moireR = analyzeMoire(midFrameImg, box);
  }

  const signals = {
    flicker: +flickerR.score.toFixed(3),
    uniformity: +uniformityR.score.toFixed(3),
    moire: +moireR.score.toFixed(3),
  };
  const score = +combineScores(signals).toFixed(3);
  return {
    score,
    classification: classifyScore(score),
    signals,
    frameCount: luminances.length,
  };
}
