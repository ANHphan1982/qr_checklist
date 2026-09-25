/**
 * Phân loại lỗi khi đăng nhập admin (GET /api/admin/stations) để KHÔNG đổ lỗi
 * nhầm cho mật khẩu:
 *  - wrong_key           : 401, key không khớp ADMIN_SECRET — ca duy nhất được nói "sai mật khẩu"
 *  - db_unavailable      : 503, server chạy nhưng không có database
 *  - server_misconfigured: 500 + body nói ADMIN_SECRET chưa cấu hình
 *  - server_error        : 500 khác — hay gặp nhất là Supabase pause (query ném OperationalError)
 *  - timeout             : request quá hạn (Render free tier cold start ~30s)
 *  - unreachable         : máy có mạng nhưng không tới được server (CORS, sai URL, server chết)
 *  - offline             : máy mất mạng
 *
 * @param {Error} err        - lỗi từ axios
 * @param {boolean} isOnline - navigator.onLine tại thời điểm lỗi
 * @returns {{ type: string, message: string }}
 */
export function adminLoginError(err, isOnline) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  // body có thể là JSON {error} hoặc chuỗi HTML (Flask 500 mặc định)
  const serverMsg = typeof body === "object" && body ? body.error || "" : "";

  if (status === 401) {
    return { type: "wrong_key", message: "Sai mật khẩu admin" };
  }

  if (status === 503) {
    return {
      type: "db_unavailable",
      message: "Server không kết nối được database — kiểm tra Supabase còn chạy và biến DATABASE_URL",
    };
  }

  if (status >= 500) {
    if (serverMsg.includes("ADMIN_SECRET")) {
      return {
        type: "server_misconfigured",
        message: "Server chưa cấu hình ADMIN_SECRET — thêm biến môi trường rồi deploy lại",
      };
    }
    return {
      type: "server_error",
      message: `Server lỗi ${status} — thường do database Supabase bị pause, kiểm tra Supabase rồi thử lại`,
    };
  }

  if (status >= 400) {
    return { type: "server_error", message: `Server từ chối yêu cầu (${status})` };
  }

  if (err?.code === "ECONNABORTED") {
    return {
      type: "timeout",
      message: "Server không phản hồi kịp (có thể đang khởi động lại) — chờ ~30 giây rồi thử lại",
    };
  }

  if (!isOnline) {
    return { type: "offline", message: "Máy đang mất mạng — bật WiFi/4G rồi thử lại" };
  }

  return {
    type: "unreachable",
    message: "Không gọi được server — kiểm tra địa chỉ API và cấu hình CORS_ORIGIN",
  };
}
