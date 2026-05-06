import { useEffect, useRef, useState, useCallback } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { hasTorchSupport, setTorch } from "../lib/torch";

const SCANNER_ID = "qr-reader";

/** qrbox chiếm 85% chiều rộng viewport, tối đa 360px */
function getQrBoxSize() {
  const size = Math.min(Math.round(window.innerWidth * 0.85), 360);
  return { width: size, height: size };
}

export const SCANNER_CONFIG = {
  fps: 10,
  qrbox: getQrBoxSize(),
  videoConstraints: {
    facingMode: "environment",
    focusMode: "continuous", // autofocus — browser bỏ qua nếu không hỗ trợ
  },
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
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);

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

      // Đèn pin cho scan thiếu sáng — Android Chrome hỗ trợ, iOS Safari chưa
      setTorchAvailable(hasTorchSupport(track));

      // Bật autofocus liên tục nếu device hỗ trợ
      if (caps?.focusMode?.includes?.("continuous")) {
        try {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        } catch {
          // device từ chối — im lặng
        }
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

  const toggleTorch = useCallback(async () => {
    const next = !torchOn;
    const ok = await setTorch(trackRef.current, next);
    if (ok) {
      setTorchOn(next);
    } else {
      // Device từ chối → ẩn nút để khỏi gây nhầm lẫn
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      SCANNER_ID,
      { ...SCANNER_CONFIG, qrbox: getQrBoxSize() },
      /* verbose= */ false
    );

    let alreadyScanned = false;
    scannerRef.current.render(
      (decodedText) => {
        // Chỉ trigger 1 lần — html5-qrcode tiếp tục quét sau callback
        if (alreadyScanned) return;
        alreadyScanned = true;
        // Pause để dừng decode loop nhưng giữ video element còn alive
        // → screen detection ở ScanPage có thể chụp frame từ video
        // Cleanup thực sự (clear) chạy khi component unmount.
        try {
          scannerRef.current?.pause?.(true);
        } catch {
          // pause() không phải lúc nào cũng có sẵn — bỏ qua
        }
        const video = document.querySelector(`#${SCANNER_ID} video`);
        onScan(decodedText, { video });
      },
      (errorMessage) => {
        // Per-frame errors (expected) — chỉ forward lỗi nghiêm trọng
        if (errorMessage?.includes("Camera")) {
          onError?.(errorMessage);
        }
      }
    );

    // E2E test hook — only available in dev builds
    if (import.meta.env.DEV) {
      window.__triggerQRScan = (text) => onScan(text);
    }

    return () => {
      clearInterval(pollRef.current);
      if (import.meta.env.DEV) window.__triggerQRScan = undefined;
      // Tắt đèn trước khi đóng camera, tránh torch còn bật sau khi dừng scan
      if (trackRef.current) {
        setTorch(trackRef.current, false).catch(() => {});
      }
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

      {/* Đèn pin cho scan ban đêm / thiếu sáng — chỉ hiện nếu device hỗ trợ */}
      {torchAvailable && (
        <button
          type="button"
          onClick={toggleTorch}
          aria-pressed={torchOn}
          aria-label={torchOn ? "Tắt đèn pin" : "Bật đèn pin"}
          className={`w-full min-h-[56px] py-3 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2 ${
            torchOn
              ? "bg-yellow-400 text-slate-900 active:bg-yellow-500"
              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 active:bg-slate-300 dark:active:bg-slate-600"
          }`}
        >
          <span>{torchOn ? "🔦" : "💡"}</span>
          <span>{torchOn ? "Tắt đèn" : "Bật đèn (thiếu sáng)"}</span>
        </button>
      )}

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
