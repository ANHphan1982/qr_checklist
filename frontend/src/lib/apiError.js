/**
 * Phân loại lỗi từ axios để phân biệt:
 *  - offline_phone    : điện thoại mất mạng
 *  - server_unreachable: điện thoại CÓ mạng nhưng server không phản hồi (CORS, server down, DNS)
 *  - server_error     : server trả 5xx
 *  - expected         : server trả 4xx có thể đọc được (không cần retry)
 *
 * @param {Error} err        - lỗi từ axios
 * @param {boolean} isOnline - navigator.onLine tại thời điểm lỗi xảy ra
 * @returns {{ type: string, shouldQueue: boolean, message: string, data?: object }}
 */
export function classifyApiError(err, isOnline) {
  const httpStatus = err?.response?.status;
  const hasHttpResponse = err?.response != null;

  // 4xx — server đã nhận và từ chối, retry không giúp được
  if (hasHttpResponse && httpStatus >= 400 && httpStatus < 500) {
    return {
      type: "expected",
      shouldQueue: false,
      message: err.response.data?.message || err.message || "Lỗi từ server",
      data: err.response.data || {},
    };
  }

  // 5xx — server lỗi nội bộ, nên retry sau
  if (hasHttpResponse && httpStatus >= 500) {
    return {
      type: "server_error",
      shouldQueue: true,
      message: "Server gặp lỗi — đã lưu offline, sẽ tự đồng bộ khi server ổn định",
    };
  }

  // Không có HTTP response (network error, CORS, timeout, DNS fail...)
  // Phân biệt bằng navigator.onLine để hiện đúng thông báo
  if (isOnline) {
    return {
      type: "server_unreachable",
      shouldQueue: true,
      message: "Không kết nối được server — đã lưu offline, sẽ tự đồng bộ khi server sẵn sàng",
    };
  }

  return {
    type: "offline_phone",
    shouldQueue: true,
    message: "Mất kết nối — đã lưu offline, sẽ tự đồng bộ khi có mạng",
  };
}
