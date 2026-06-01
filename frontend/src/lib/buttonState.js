/**
 * resolveButtonState — trả về trạng thái nút hành động tại mỗi bước scan.
 * Loading = true ngay khi tap, không cần chờ step chuyển.
 *
 * @returns {{ show, variant, loading, label }}
 */
export function resolveButtonState(step) {
  switch (step) {
    case "idle":
      return { show: true, variant: "primary",   loading: false, label: "📷 Bắt đầu Scan" };
    case "permission":
      return { show: true, variant: "primary",   loading: true,  label: "🔍 Kiểm tra GPS..." };
    case "scanning":
      return { show: true, variant: "secondary", loading: false, label: "⏹ Dừng Camera" };
    case "gps":
      return { show: true, variant: "primary",   loading: true,  label: "📍 Đang lấy vị trí..." };
    case "sending":
      return { show: true, variant: "primary",   loading: true,  label: "⏳ Đang gửi..." };
    case "done":
      return { show: true, variant: "primary",   loading: false, label: "📷 Quét tiếp" };
    default:
      return { show: false, variant: "hidden",   loading: false, label: "" };
  }
}
