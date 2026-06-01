/**
 * resolveStatusBanner — pick the single highest-priority status banner.
 * Priority: coldStart > offline > sync_error > sync_ok > GPS hint
 *
 * @returns {{ type, text, variant, extra? } | null}
 */

const BUSY_STEPS = new Set(["permission", "gps", "sending"]);

const GPS_BANNERS = {
  granted: { type: "gps_granted", text: "GPS đã sẵn sàng",                                                        variant: "success" },
  prompt:  { type: "gps_prompt",  text: "Sẽ hỏi quyền GPS khi scan",                                               variant: "info"    },
  denied:  { type: "gps_denied",  text: "GPS bị từ chối — check-in vẫn hoạt động, không xác thực vị trí",          variant: "warning" },
  unknown: { type: "gps_unknown", text: "Không kiểm tra được GPS",                                                  variant: "muted"   },
};

export function resolveStatusBanner({ isOnline, syncMsg, coldStart, gpsPermission, step, paramCacheCount }) {
  if (coldStart) {
    return { type: "coldstart", text: "Server đang khởi động (cold start ~30s), vui lòng chờ...", variant: "warning" };
  }

  if (!isOnline) {
    return {
      type:    "offline",
      text:    "Không có mạng — scan vẫn hoạt động, dữ liệu lưu offline",
      variant: "warning_secondary",
      extra:   paramCacheCount === 0
        ? "Chưa có cache thông số vận hành — cần kết nối mạng 1 lần để tải về"
        : null,
    };
  }

  if (syncMsg?.ok === false) {
    return { type: "sync_error", text: syncMsg.text, variant: "error" };
  }

  if (syncMsg?.ok === true) {
    return { type: "sync_ok", text: syncMsg.text, variant: "success" };
  }

  if (gpsPermission && !BUSY_STEPS.has(step)) {
    return GPS_BANNERS[gpsPermission] ?? null;
  }

  return null;
}
