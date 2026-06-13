/**
 * TDD — lib/autoTorch.js
 * Máy trạng thái tự động bật/tắt đèn pin theo độ sáng (hysteresis).
 *
 * Quy tắc:
 *   - Tối (luminance < onThreshold) → tự BẬT
 *   - Sáng lại (luminance > offThreshold) → tự TẮT
 *   - Hysteresis: vùng giữa onThreshold..offThreshold không đổi trạng thái
 *     (chống nhấp nháy khi độ sáng dao động quanh 1 ngưỡng)
 *   - Tôn trọng thao tác tay: nếu user TẮT đèn lúc đang tối → KHÓA auto-bật
 *     cho tới khi sáng trở lại (hết episode tối hiện tại)
 *
 * API:
 *   createAutoTorchController({ onThreshold?, offThreshold? }) → {
 *     update(luminance) → 'on' | 'off' | null   // hành động cần áp dụng
 *     setManual(on)                              // user bấm tay
 *     isOn() → boolean
 *   }
 */
import { describe, it, expect } from "vitest";
import { createAutoTorchController, AUTO_TORCH_DEFAULTS } from "../autoTorch.js";

describe("AUTO_TORCH_DEFAULTS", () => {
  it("có onThreshold < offThreshold (hysteresis hợp lệ)", () => {
    expect(AUTO_TORCH_DEFAULTS.onThreshold).toBeLessThan(AUTO_TORCH_DEFAULTS.offThreshold);
  });
});

describe("createAutoTorchController — hysteresis cơ bản", () => {
  it("khởi tạo trạng thái tắt", () => {
    const c = createAutoTorchController();
    expect(c.isOn()).toBe(false);
  });

  it("tối → tự bật, trả 'on'", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    expect(c.update(20)).toBe("on");
    expect(c.isOn()).toBe(true);
  });

  it("vẫn tối ở lần update tiếp theo → không lặp 'on', trả null", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    c.update(20);
    expect(c.update(15)).toBe(null);
    expect(c.isOn()).toBe(true);
  });

  it("sáng lại vượt offThreshold → tự tắt, trả 'off'", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    c.update(20); // bật
    expect(c.update(80)).toBe("off");
    expect(c.isOn()).toBe(false);
  });

  it("vùng hysteresis (giữa hai ngưỡng) không đổi trạng thái", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    // đang tắt, luminance 55 nằm giữa → không bật
    expect(c.update(55)).toBe(null);
    expect(c.isOn()).toBe(false);
    // bật lên rồi, luminance 55 nằm giữa → không tắt
    c.update(20);
    expect(c.update(55)).toBe(null);
    expect(c.isOn()).toBe(true);
  });

  it("ngay tại ngưỡng không kích hoạt (dùng so sánh chặt < và >)", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    expect(c.update(40)).toBe(null); // không < 40
    expect(c.isOn()).toBe(false);
    c.update(20); // bật
    expect(c.update(70)).toBe(null); // không > 70
    expect(c.isOn()).toBe(true);
  });
});

describe("createAutoTorchController — input không hợp lệ", () => {
  it("luminance null/NaN → null, không đổi trạng thái", () => {
    const c = createAutoTorchController();
    expect(c.update(null)).toBe(null);
    expect(c.update(undefined)).toBe(null);
    expect(c.update(NaN)).toBe(null);
    expect(c.isOn()).toBe(false);
  });
});

describe("createAutoTorchController — tôn trọng thao tác tay", () => {
  it("user tắt tay lúc đang tối → khóa auto-bật trong episode tối", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    c.update(20); // auto bật
    c.setManual(false); // user tắt tay
    expect(c.isOn()).toBe(false);
    // vẫn tối → KHÔNG tự bật lại
    expect(c.update(15)).toBe(null);
    expect(c.isOn()).toBe(false);
  });

  it("sau khi user tắt, sáng trở lại rồi tối lần nữa → auto bật lại được", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    c.update(20);
    c.setManual(false); // khóa
    c.update(90); // sáng trở lại → reset khóa
    expect(c.update(15)).toBe("on"); // tối lần nữa → auto bật lại
    expect(c.isOn()).toBe(true);
  });

  it("user bật tay lúc đang sáng → auto tắt khi sáng vượt ngưỡng", () => {
    const c = createAutoTorchController({ onThreshold: 40, offThreshold: 70 });
    c.setManual(true);
    expect(c.isOn()).toBe(true);
    // sáng vượt offThreshold → auto vẫn được phép tắt
    expect(c.update(90)).toBe("off");
    expect(c.isOn()).toBe(false);
  });
});
