/**
 * scannerView — logic thuần cho khung ngắm camera tự thiết kế.
 * Tách khỏi QRScanner.jsx để test được không cần DOM/camera.
 */

/** Vùng quét QR: 85% chiều rộng viewport, tối đa 360px, hình vuông. */
export function qrBoxSizeFor(viewportWidth) {
  const size = Math.min(Math.round(viewportWidth * 0.85), 360);
  return { width: size, height: size };
}

/**
 * Map trạng thái camera → cờ hiển thị UI.
 *   starting → spinner (đang xin quyền + mở camera)
 *   active   → scan line animation trong khung ngắm
 *   failed   → thông báo lỗi camera (denied / không có camera)
 */
export function resolveCameraView(state) {
  return {
    showSpinner:  state === "starting",
    showScanLine: state === "active",
    showError:    state === "failed",
  };
}
