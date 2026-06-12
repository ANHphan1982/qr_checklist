/**
 * resolveButtonState — trả về trạng thái nút hành động tại mỗi bước scan.
 * Loading = true ngay khi tap, không cần chờ step chuyển.
 *
 * icon: tên icon SVG (lucide) — "camera" | "stop" | null.
 * Các bước loading không có icon vì spinner đã hiển thị.
 *
 * @returns {{ show, variant, loading, label, icon }}
 */
export function resolveButtonState(step) {
  switch (step) {
    case "idle":
      return { show: true, variant: "primary",   loading: false, label: "Bắt đầu Scan",      icon: "camera" };
    case "permission":
      return { show: true, variant: "primary",   loading: true,  label: "Kiểm tra GPS...",    icon: null };
    case "scanning":
      return { show: true, variant: "secondary", loading: false, label: "Dừng Camera",        icon: "stop" };
    case "gps":
      return { show: true, variant: "primary",   loading: true,  label: "Đang lấy vị trí...", icon: null };
    case "sending":
      return { show: true, variant: "primary",   loading: true,  label: "Đang gửi...",        icon: null };
    case "done":
      return { show: true, variant: "primary",   loading: false, label: "Quét tiếp",          icon: "camera" };
    default:
      return { show: false, variant: "hidden",   loading: false, label: "", icon: null };
  }
}
