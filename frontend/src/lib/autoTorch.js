/**
 * lib/autoTorch.js — Máy trạng thái tự bật/tắt đèn pin theo độ sáng (hysteresis).
 *
 * Vì sao hysteresis: nếu chỉ dùng 1 ngưỡng, độ sáng dao động sát ngưỡng sẽ làm
 * đèn nhấp nháy liên tục. Hai ngưỡng tách biệt (onThreshold < offThreshold) tạo
 * vùng chết ở giữa → trạng thái ổn định.
 *
 * Tôn trọng thao tác tay: nếu user TẮT đèn trong lúc đang tối, ta khóa auto-bật
 * cho tới khi sáng trở lại (kết thúc episode tối hiện tại) — tránh việc vừa tắt
 * tay đã bị tự bật lại ngay.
 */

export const AUTO_TORCH_DEFAULTS = {
  onThreshold: 40, // luminance < 40 (trên thang 0..255) coi là thiếu sáng → bật
  offThreshold: 70, // luminance > 70 coi là đủ sáng → tắt
};

export function createAutoTorchController(opts = {}) {
  const onThreshold = opts.onThreshold ?? AUTO_TORCH_DEFAULTS.onThreshold;
  const offThreshold = opts.offThreshold ?? AUTO_TORCH_DEFAULTS.offThreshold;

  let torchOn = false;
  let userSuppressed = false; // user tắt tay lúc tối → chặn auto-bật tới khi sáng lại

  return {
    // Nạp 1 mẫu độ sáng. Trả hành động CẦN áp dụng lên phần cứng:
    //   'on'  → cần gọi setTorch(track, true)
    //   'off' → cần gọi setTorch(track, false)
    //   null  → giữ nguyên
    update(luminance) {
      if (luminance == null || Number.isNaN(luminance)) return null;

      if (luminance > offThreshold) {
        userSuppressed = false; // sáng trở lại → bỏ khóa cho episode tối sau
        if (torchOn) {
          torchOn = false;
          return "off";
        }
        return null;
      }

      if (luminance < onThreshold && !torchOn && !userSuppressed) {
        torchOn = true;
        return "on";
      }

      return null;
    },

    // User bấm nút đèn. Tắt tay lúc tối → khóa auto-bật; bật tay → mở khóa.
    setManual(on) {
      torchOn = Boolean(on);
      userSuppressed = !torchOn;
    },

    isOn() {
      return torchOn;
    },
  };
}
