/**
 * Phát hiện QR scan từ màn hình LCD/LED dựa trên 3 dấu hiệu vật lý:
 *
 *   A. Flicker          — DFT 1D trên luminance series; peak trong band tần số
 *                         refresh-related (relative theo fps capture).
 *                         30fps aliases 60Hz về 0 → band mở rộng từ max(5, 0.15*fps).
 *                         Weight giảm (0.3) vì modern monitors ít flicker visible.
 *
 *   B. Uniformity (P2)  — Đo CHỈ vùng TRẮNG (L > 130) trong QR box thay vì toàn bộ.
 *                         Màn hình: white pixels sáng (≥215) + đồng đều (CoV < 0.04).
 *                         Giấy: white pixels tối hơn (ánh sáng phản xạ) và/hoặc biến động.
 *                         Score = flatScore × brightnessScore (multiplicative).
 *
 *   C. White Screen     — Thay FFT moiré (bị nhiễu bởi pattern QR chính).
 *      Indicator (P1)     Màn hình tự phát sáng → white pixels sáng (≥215) và rất đồng đều.
 *                         Giấy phản xạ ánh sáng môi trường → dim hơn, biến động hơn.
 *                         Score = covScore × brightnessScore (multiplicative).
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
  flicker:     0.3,  // Modern monitors ít flicker visible → giảm weight
  uniformity:  0.4,  // White pixel uniformity — reliable nhất sau P2 fix
  moire:       0.3,  // White Screen Indicator (thay FFT moiré) — tăng weight
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
 * P2 fix: đo CHỈ các pixel TRẮNG (L > WHITE_THRESHOLD) bên trong QR box thay vì
 * toàn bộ vùng (vốn bao gồm module đen → CoV luôn cao vì binary pattern).
 *
 * Hai tín hiệu:
 *   - flatScore (primary): CoV của white pixels thấp → vùng trắng đồng đều
 *   - ratioScore (bonus):  outsideStd / insideStd cao → màn hình làm nền phẳng hơn môi trường
 *
 * Gate: wMean < BRIGHTNESS_GATE → quá tối để là màn hình → score = 0.
 * Calibration: camera auto-exposure khi quét màn hình đưa white về ~180-210,
 * không phải 215+. Ngưỡng 160 để không bỏ lọt real screen scans.
 */
export function analyzeUniformity(img, qrBox) {
  const empty = { score: 0, covInside: 0, stdRatio: 0, meanInside: 0 };
  if (!qrBox || qrBox.w <= 0 || qrBox.h <= 0) return empty;
  if (!img || !img.data) return empty;

  const WHITE_THRESHOLD = 100; // pixel sáng hơn → "white module" (rộng hơn để bắt 160-200)
  const BRIGHTNESS_GATE = 160; // dưới mức này → dim, không thể là màn hình
  const COV_FLAT_MAX    = 0.06; // screen whites: CoV < 0.06 (bao gồm camera noise ~±3)

  // --- Welford's trên white pixels inside QR box ---
  const x0 = Math.max(0, Math.floor(qrBox.x));
  const y0 = Math.max(0, Math.floor(qrBox.y));
  const x1 = Math.min(img.width,  Math.floor(qrBox.x + qrBox.w));
  const y1 = Math.min(img.height, Math.floor(qrBox.y + qrBox.h));
  if (x1 <= x0 || y1 <= y0) return empty;

  let wCount = 0, wMean = 0, wM2 = 0;
  const { data, width } = img;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const off = (y * width + x) * 4;
      const L = pixelLuminance(data[off], data[off + 1], data[off + 2]);
      if (L < WHITE_THRESHOLD) continue;
      wCount++;
      const delta = L - wMean;
      wMean += delta / wCount;
      wM2 += delta * (L - wMean);
    }
  }

  // Không đủ white pixels → môi trường tối → không thể là màn hình
  const minWhite = Math.max(4, Math.floor((x1 - x0) * (y1 - y0) * 0.05));
  if (wCount < minWhite) {
    return { score: 0, covInside: 0, stdRatio: 0, meanInside: 0 };
  }

  const wStd = Math.sqrt(wM2 / wCount);
  const covInside = wMean > 0 ? wStd / wMean : 0;

  // --- Ring outside QR box (giữ nguyên cho ratioScore) ---
  const ring = 20;
  const top   = regionStats(img, qrBox.x - ring, qrBox.y - ring,    qrBox.w + 2 * ring, ring);
  const bot   = regionStats(img, qrBox.x - ring, qrBox.y + qrBox.h, qrBox.w + 2 * ring, ring);
  const left  = regionStats(img, qrBox.x - ring, qrBox.y,           ring, qrBox.h);
  const right = regionStats(img, qrBox.x + qrBox.w, qrBox.y,        ring, qrBox.h);

  let outCount = 0, outMeanW = 0;
  for (const r of [top, bot, left, right]) { outCount += r.count; outMeanW += r.mean * r.count; }
  let outsideStd = 0;
  if (outCount > 0) {
    const outMean = outMeanW / outCount;
    let varSum = 0;
    for (const r of [top, bot, left, right]) {
      if (r.count > 0) varSum += r.count * (r.std * r.std + (r.mean - outMean) ** 2);
    }
    outsideStd = Math.sqrt(varSum / outCount);
  }

  const stdRatio = outsideStd / Math.max(wStd, 1.0);

  // Gate: quá tối → không thể là màn hình (paper under dim light)
  if (wMean < BRIGHTNESS_GATE) {
    return { score: 0, covInside, stdRatio, meanInside: wMean };
  }

  const flatScore  = clamp(1 - covInside / COV_FLAT_MAX, 0, 1);
  const ratioScore = clamp((stdRatio - 1) / 3, 0, 1);
  // flatScore là signal chính; ratioScore là bonus nhỏ khi môi trường ngoài phức tạp hơn QR
  const score = clamp(flatScore + 0.12 * ratioScore * flatScore, 0, 1);
  return { score: +score.toFixed(3), covInside, stdRatio, meanInside: wMean };
}

/**
 * @returns {{score: number, energyRatio: number}}
 *
 * White Screen Indicator — thay thế FFT moiré vốn bị nhiễu bởi pattern QR.
 *
 * Nguyên lý: màn hình LCD/OLED tự phát sáng → vùng trắng rất đồng đều (CoV thấp).
 * Giấy in phản xạ ánh sáng môi trường → có biến thiên tự nhiên (paper grain, shadow).
 *
 * Gate: mean white < 160 → quá tối để là màn hình → score = 0.
 * Calibration: camera auto-exposure đưa screen white về ~180-210, không phải 215+.
 * Dùng gate thay vì multiplicative để không bỏ lọt real screen scans (score = 0).
 *
 * Primary signal: CoV của white pixels (screen < 0.06, paper 0.05-0.15).
 * False positive đã biết: giấy laminated sáng bóng dưới đèn LED mạnh (CoV thấp).
 * energyRatio: repurposed → covWhite (để báo cáo, field name giữ nguyên).
 */
export function analyzeMoire(img, qrBox) {
  const empty = { score: 0, energyRatio: 0 };
  if (!qrBox || qrBox.w <= 0 || qrBox.h <= 0) return empty;
  if (!img || !img.data) return empty;

  const WHITE_THRESHOLD = 100; // pixel sáng hơn threshold → coi là "white module"
  const BRIGHTNESS_GATE = 160; // dưới mức này → quá tối để là màn hình (gated out)
  const COV_MAX = 0.06;        // screen whites: CoV < 0.06 (bao gồm camera noise) (rất đồng đều)

  const x0 = Math.max(0, Math.floor(qrBox.x));
  const y0 = Math.max(0, Math.floor(qrBox.y));
  const x1 = Math.min(img.width,  Math.floor(qrBox.x + qrBox.w));
  const y1 = Math.min(img.height, Math.floor(qrBox.y + qrBox.h));
  if (x1 <= x0 || y1 <= y0) return empty;

  // Welford's single-pass stats trên white pixels
  let count = 0, mean = 0, m2 = 0;
  const { data, width } = img;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const off = (y * width + x) * 4;
      const L = pixelLuminance(data[off], data[off + 1], data[off + 2]);
      if (L < WHITE_THRESHOLD) continue;
      count++;
      const delta = L - mean;
      mean += delta / count;
      m2 += delta * (L - mean);
    }
  }

  // Không đủ white pixels → dim environment → không thể là màn hình
  const minWhiteCount = Math.floor((x1 - x0) * (y1 - y0) * 0.05);
  if (count < Math.max(4, minWhiteCount)) return { score: 0, energyRatio: 0 };

  const std = Math.sqrt(m2 / count);
  const covWhite = mean > 0 ? std / mean : 0;

  // Gate: quá tối → không thể là màn hình (paper under dim/ambient light)
  if (mean < BRIGHTNESS_GATE) return { score: 0, energyRatio: +covWhite.toFixed(3) };

  // Primary signal: CoV uniformity (screen = very uniform white, CoV < 0.06)
  const covScore = clamp(1 - covWhite / COV_MAX, 0, 1);
  return { score: +covScore.toFixed(3), energyRatio: +covWhite.toFixed(3) };
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
