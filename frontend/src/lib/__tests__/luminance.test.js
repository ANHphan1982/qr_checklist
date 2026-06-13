/**
 * TDD — lib/luminance.js
 * Ước lượng độ sáng frame video để quyết định bật đèn tự động khi thiếu sáng.
 *
 * API:
 *   averageLuminance(data, sampleStep?) → number 0..255 | null
 *     data = Uint8ClampedArray RGBA (như ImageData.data)
 *   estimateLuminance(video, canvas, size?) → number 0..255 | null
 *     vẽ frame xuống canvas nhỏ rồi tính luminance trung bình
 *
 * Yêu cầu:
 *   - Không throw khi input thiếu/không hợp lệ → trả null
 *   - Không throw khi getImageData ném (canvas tainted / chưa sẵn sàng) → null
 *   - Luminance theo công thức 0.299R + 0.587G + 0.114B
 */
import { describe, it, expect, vi } from "vitest";
import { averageLuminance, estimateLuminance } from "../luminance.js";

// Helper tạo Uint8ClampedArray RGBA đồng màu cho n pixel
function solidPixels(r, g, b, n = 4) {
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

// ---------------------------------------------------------------------------
// averageLuminance
// ---------------------------------------------------------------------------

describe("averageLuminance", () => {
  it("returns null khi data là null/undefined", () => {
    expect(averageLuminance(null)).toBe(null);
    expect(averageLuminance(undefined)).toBe(null);
  });

  it("returns null khi data rỗng (chưa đủ 1 pixel)", () => {
    expect(averageLuminance(new Uint8ClampedArray(0))).toBe(null);
  });

  it("đen tuyền (0,0,0) → luminance 0", () => {
    expect(averageLuminance(solidPixels(0, 0, 0))).toBe(0);
  });

  it("trắng tuyền (255,255,255) → luminance ~255", () => {
    expect(averageLuminance(solidPixels(255, 255, 255))).toBeCloseTo(255, 5);
  });

  it("đỏ tuyền (255,0,0) → 0.299*255 ≈ 76.245", () => {
    expect(averageLuminance(solidPixels(255, 0, 0))).toBeCloseTo(76.245, 3);
  });

  it("lục tuyền (0,255,0) → 0.587*255 ≈ 149.685", () => {
    expect(averageLuminance(solidPixels(0, 255, 0))).toBeCloseTo(149.685, 3);
  });

  it("trung bình hai pixel sáng/tối", () => {
    const data = new Uint8ClampedArray(8);
    // pixel 0 = trắng (lum 255), pixel 1 = đen (lum 0) → trung bình 127.5
    data.set([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(averageLuminance(data)).toBeCloseTo(127.5, 3);
  });

  it("data có độ dài không chia hết cho 4 → dừng an toàn ở pixel cuối đủ kênh", () => {
    // 6 byte = 1 pixel đủ RGBA (4 byte) + 2 byte thừa → chỉ tính pixel hợp lệ
    const data = new Uint8ClampedArray([255, 255, 255, 255, 10, 20]);
    expect(averageLuminance(data)).toBeCloseTo(255, 5);
  });

  it("sampleStep bỏ qua pixel nhưng vẫn trả kết quả hợp lệ", () => {
    // 4 pixel: trắng, đen, trắng, đen. sampleStep=2 chỉ lấy pixel 0 và 2 → trắng → 255
    const data = new Uint8ClampedArray(16);
    data.set([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    expect(averageLuminance(data, 2)).toBeCloseTo(255, 5);
  });
});

// ---------------------------------------------------------------------------
// estimateLuminance
// ---------------------------------------------------------------------------

function fakeCanvas(ctx) {
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
}

describe("estimateLuminance", () => {
  it("returns null khi video null", () => {
    expect(estimateLuminance(null, fakeCanvas({}))).toBe(null);
  });

  it("returns null khi canvas null", () => {
    expect(estimateLuminance({ videoWidth: 100, videoHeight: 100 }, null)).toBe(null);
  });

  it("returns null khi video chưa có kích thước (chưa sẵn sàng)", () => {
    const video = { videoWidth: 0, videoHeight: 0 };
    expect(estimateLuminance(video, fakeCanvas({}))).toBe(null);
  });

  it("returns null khi không lấy được 2d context", () => {
    const video = { videoWidth: 100, videoHeight: 100 };
    expect(estimateLuminance(video, fakeCanvas(null))).toBe(null);
  });

  it("returns null khi canvas không có hàm getContext", () => {
    const video = { videoWidth: 100, videoHeight: 100 };
    expect(estimateLuminance(video, { width: 0, height: 0 })).toBe(null);
  });

  it("vẽ frame và trả luminance trung bình", () => {
    const video = { videoWidth: 640, videoHeight: 480 };
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: solidPixels(0, 0, 0, 16) })),
    };
    const canvas = fakeCanvas(ctx);
    const lum = estimateLuminance(video, canvas, 4);
    expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 4, 4);
    expect(lum).toBe(0);
  });

  it("returns null khi getImageData throw (canvas tainted)", () => {
    const video = { videoWidth: 640, videoHeight: 480 };
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new Error("SecurityError: tainted canvas");
      }),
    };
    expect(estimateLuminance(video, fakeCanvas(ctx))).toBe(null);
  });
});
