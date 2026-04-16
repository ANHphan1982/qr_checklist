import { useEffect, useRef, useState, useCallback } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

const SCANNER_ID = "qr-reader";

/** qrbox chiếm 85% chiều rộng viewport, tối đa 360px */
function getQrBoxSize() {
  const size = Math.min(Math.round(window.innerWidth * 0.85), 360);
  return { width: size, height: size };
}

export const SCANNER_CONFIG = {
  fps: 10,
  qrbox: getQrBoxSize(),
  videoConstraints: { facingMode: "environment" },
};

/**
 * QR Scanner dùng Html5QrcodeScanner (SKILL.md pattern).
 * - div#qr-reader phải tồn tại trong DOM trước khi init
 * - iOS Safari yêu cầu user gesture → nút "Bắt đầu" ở ScanPage
 * - Zoom: dùng hardware zoom (MediaTrackConstraints) nếu device hỗ trợ
 */
export function QRScanner({ onScan, onError }) {
  const scannerRef = useRef(null);
  const trackRef   = useRef(null);
  const pollRef    = useRef(null);

  const [zoom, setZoom]           = useState(1);
  const [zoomRange, setZoomRange] = useState(null); // { min, max, step }

  // Sau khi scanner render, poll cho đến khi video element + srcObject sẵn sàng
  useEffect(() => {
    pollRef.current = setInterval(() => {
      const video = document.querySelector(`#${SCANNER_ID} video`);
      if (!video?.srcObject) return;

      clearInterval(pollRef.current);
      const track = video.srcObject.getVideoTracks()[0];
      if (!track) return;
      trackRef.current = track;

      const caps = track.getCapabilities?.();
      if (caps?.zoom) {
        const min  = caps.zoom.min  ?? 1;
        const max  = caps.zoom.max  ?? 5;
        const step = caps.zoom.step ?? 0.5;
        setZoomRange({ min, max, step });
        setZoom(min);
      }
    }, 500);

    return () => clearInterval(pollRef.current);
  }, []);

  const applyZoom = useCallback((newZoom) => {
    setZoom(newZoom);
    if (trackRef.current) {
      try {
        trackRef.current.applyConstraints({ advanced: [{ zoom: newZoom }] });
      } catch {
        // device không hỗ trợ hardware zoom — im lặng
      }
    }
  }, []);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      SCANNER_ID,
      { ...SCANNER_CONFIG, qrbox: getQrBoxSize() },
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
      clearInterval(pollRef.current);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, []);

  const step      = zoomRange?.step ?? 0.5;
  const canZoomIn  = zoomRange && zoom < zoomRange.max;
  const canZoomOut = zoomRange && zoom > zoomRange.min;

  return (
    <div className="flex flex-col gap-3">
      {/* QUAN TRỌNG: div này phải render trước useEffect */}
      <div id={SCANNER_ID} className="w-full" />

      {/* Zoom controls — chỉ hiện nếu device hỗ trợ hardware zoom */}
      {zoomRange && (
        <div className="flex items-center justify-center gap-5">
          <button
            disabled={!canZoomOut}
            onClick={() => applyZoom(Math.max(zoomRange.min, +(zoom - step).toFixed(1)))}
            className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-3xl font-bold disabled:opacity-30 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
          >
            −
          </button>
          <span className="text-lg text-slate-600 dark:text-slate-300 w-16 text-center font-medium">
            {zoom.toFixed(1)}×
          </span>
          <button
            disabled={!canZoomIn}
            onClick={() => applyZoom(Math.min(zoomRange.max, +(zoom + step).toFixed(1)))}
            className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-3xl font-bold disabled:opacity-30 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
