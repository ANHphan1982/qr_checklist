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
      message: "Đã lưu offline — server tạm lỗi, sẽ tự đồng bộ khi ổn định",
    };
  }

  // Không có HTTP response (network error, CORS, timeout, DNS fail...)
  // Đều lưu offline và hiện thông báo tích cực — "Đã lưu offline" là thông điệp chính
  if (isOnline) {
    return {
      type: "server_unreachable",
      shouldQueue: true,
      message: "Đã lưu offline — không kết nối được server, sẽ tự đồng bộ khi có mạng",
    };
  }

  return {
    type: "offline_phone",
    shouldQueue: true,
    message: "Đã lưu offline — sẽ tự đồng bộ khi có mạng",
  };
}
