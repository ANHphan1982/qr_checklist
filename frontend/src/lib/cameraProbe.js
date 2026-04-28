import { STATUS } from "./mdmProbes.js";

/**
 * Probe camera bằng cách gọi getUserMedia rồi release ngay.
 * Tách ra để test được độc lập với MdmCheckPage.
 *
 * @returns {Promise<{status: string, detail: string}>}
 */
export async function probeCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      status: STATUS.FAIL,
      detail: "Trình duyệt không hỗ trợ getUserMedia — cần HTTPS và trình duyệt hiện đại",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return { status: STATUS.PASS, detail: "Camera hoạt động bình thường" };
  } catch (e) {
    const name = e.name || "";
    const isTransient = name === "NotReadableError" || name === "TrackStartError";
    return { status: isTransient ? STATUS.WARN : STATUS.FAIL, detail: buildCameraError(e) };
  }
}

function buildCameraError(e) {
  const name = e.name || "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return (
      "Quyền camera bị từ chối — MDM Device Restriction Policy có thể đang chặn camera. " +
      "Kiểm tra: MDM → Restrictions → Allow Camera"
    );
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Không tìm thấy camera trên thiết bị";
  }

  // Camera đang được app khác giữ (Instagram, Zalo, v.v.) hoặc vừa release chưa kịp.
  // Đây là lỗi tạm thời, không phải MDM policy → WARN thay vì FAIL.
  if (name === "NotReadableError" || name === "TrackStartError") {
    return (
      "Camera đang được dùng bởi ứng dụng khác (Instagram, Zalo, Messenger...) " +
      "hoặc vừa được giải phóng và OS chưa kịp reset. " +
      "Đóng tất cả ứng dụng dùng camera, đợi 3-5 giây rồi chạy lại kiểm tra"
    );
  }

  if (name === "OverconstrainedError") {
    return `Camera không đáp ứng được yêu cầu kỹ thuật: ${e.message || ""}`;
  }

  return `Lỗi camera: ${name} — ${e.message || ""}`;
}

export { buildCameraError };
