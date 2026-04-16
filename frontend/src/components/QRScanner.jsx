import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

const SCANNER_ID = "qr-reader";

export const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  videoConstraints: { facingMode: "environment" },
};

/**
 * QR Scanner dùng Html5QrcodeScanner (SKILL.md pattern).
 * - div#qr-reader phải tồn tại trong DOM trước khi init
 * - iOS Safari yêu cầu user gesture → nút "Bắt đầu" ở ScanPage
 */
export function QRScanner({ onScan, onError }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      SCANNER_ID,
      SCANNER_CONFIG,
      /* verbose= */ false
    );

    scannerRef.current.render(
      (decodedText) => {
        // Dừng camera ngay sau khi scan thành công
        scannerRef.current.clear().catch(console.error);
        onScan(decodedText);
      },
      (errorMessage) => {
        // Per-frame errors (expected) — chỉ forward lỗi nghiêm trọng
        if (errorMessage?.includes("Camera")) {
          onError?.(errorMessage);
        }
      }
    );

    return () => {
      // Cleanup bắt buộc — tránh memory leak và "video element busy"
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, []);

  // QUAN TRỌNG: div này phải render trước useEffect
  return <div id={SCANNER_ID} className="w-full" />;
}
