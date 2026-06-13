/**
 * lib/luminance.js — Ước lượng độ sáng frame video để bật đèn tự động khi tối.
 *
 * Không dùng AmbientLightSensor (gần như không device nào expose). Thay vào đó
 * vẽ frame camera xuống canvas nhỏ rồi tính luminance trung bình các pixel.
 *
 * Luminance theo trọng số mắt người: 0.299R + 0.587G + 0.114B (Rec. 601).
 * Tất cả hàm null-safe — không throw, trả null khi không sample được.
 */

// RGBA Uint8ClampedArray (như ImageData.data) → luminance trung bình 0..255 | null.
// sampleStep > 1 để bỏ bớt pixel cho nhẹ CPU (mỗi pixel = 4 byte).
export function averageLuminance(data, sampleStep = 1) {
  if (!data || data.length < 4) return null;
  const stride = 4 * Math.max(1, Math.floor(sampleStep));
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < data.length; i += stride) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count++;
  }
  return count ? sum / count : null;
}

// Vẽ frame video xuống canvas size×size rồi đo luminance. Trả null nếu chưa
// sẵn sàng (video chưa có kích thước) hoặc getImageData ném (canvas tainted).
export function estimateLuminance(video, canvas, size = 32) {
  if (!video || !canvas) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx) return null;

  canvas.width = size;
  canvas.height = size;
  try {
    ctx.drawImage(video, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    return averageLuminance(data);
  } catch {
    // canvas tainted (cross-origin) hoặc frame chưa decode — im lặng
    return null;
  }
}
