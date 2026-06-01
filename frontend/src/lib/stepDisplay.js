/**
 * resolveStepDisplay — simplified step indicator.
 * Ẩn khi idle hoặc done, chỉ hiện label + progress% khi đang active.
 *
 * @returns {{ shouldShow, label, progressPct }}
 */

// done included for progress calculation (params = 5/6 ≈ 83%, done = 100%)
const ACTIVE_STEPS = ["permission", "scanning", "gps", "sending", "params", "done"];

const STEP_LABELS = {
  permission: "Kiểm tra GPS",
  scanning:   "Đang quét mã",
  gps:        "Lấy vị trí",
  sending:    "Đang gửi dữ liệu",
  params:     "Nhập thông số",
};

export function resolveStepDisplay(step) {
  const idx = ACTIVE_STEPS.indexOf(step);
  if (idx === -1 || step === "done") {
    return { shouldShow: false, label: "", progressPct: step === "done" ? 100 : 0 };
  }
  return {
    shouldShow:  true,
    label:       STEP_LABELS[step],
    progressPct: Math.round(((idx + 1) / ACTIVE_STEPS.length) * 100),
  };
}
