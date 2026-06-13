import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Flashlight, FlashlightOff, Minus, Plus, VideoOff } from "lucide-react";
import { hasTorchSupport, setTorch } from "../lib/torch";
import { estimateLuminance } from "../lib/luminance";
import { createAutoTorchController } from "../lib/autoTorch";
import { qrBoxSizeFor, resolveCameraView } from "../lib/scannerView";

const SCANNER_ID = "qr-reader";

// Chu kỳ lấy mẫu độ sáng để tự bật/tắt đèn (ms). Đủ thưa để không tốn CPU,
// đủ dày để phản ứng kịp khi user bước vào chỗ tối.
const LUMINANCE_SAMPLE_MS = 1500;

// Export cho test config (QRScanner.config.test.js) — giá trị thực truyền vào
// scanner.start() bên dưới lấy từ object này.
export const SCANNER_CONFIG = {
  fps: 10,
  qrbox: qrBoxSizeFor(typeof window !== "undefined" ? window.innerWidth : 360),
  videoConstraints: {
    facingMode: "environment",
    focusMode: "continuous", // autofocus — browser bỏ qua nếu không hỗ trợ
  },
};

/**
 * QR Scanner dùng class Html5Qrcode (low-level, không UI mặc định).
 * Trước đây dùng Html5QrcodeScanner — render nút/dropdown tiếng Anh không style
 * được. Class low-level cho phép tự vẽ khung ngắm + scan line + error state.
 *
 * - div#qr-reader phải tồn tại trong DOM trước khi init (SKILL.md pattern)
 * - iOS Safari yêu cầu user gesture → nút "Bắt đầu" ở ScanPage
 * - Camera fail (denied/không có) → hiện lỗi TRONG component, không bounce về idle;
 *   user thoát bằng nút "Dừng Camera" — đồng thời giữ __triggerQRScan cho E2E.
 * - Zoom/đèn pin: hardware constraints nếu device hỗ trợ
 */
export function QRScanner({ onScan }) {
  const scannerRef = useRef(null);
  const trackRef   = useRef(null);
  const pollRef    = useRef(null);
  const autoTorchRef = useRef(null);      // máy trạng thái hysteresis
  const lumCanvasRef = useRef(null);      // canvas ẩn để đo độ sáng frame
  const lumPollRef   = useRef(null);      // interval lấy mẫu độ sáng

  // starting | active | failed
  const [cameraState, setCameraState] = useState("starting");
  const [zoom, setZoom]           = useState(1);
  const [zoomRange, setZoomRange] = useState(null); // { min, max, step }
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);

  // Khởi động camera + decode loop
  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID, /* verbose= */ false);
    scannerRef.current = scanner;

    let alreadyScanned = false;
    let cancelled = false; // StrictMode double-mount / unmount giữa chừng

    scanner
      .start(
        { facingMode: SCANNER_CONFIG.videoConstraints.facingMode },
        { fps: SCANNER_CONFIG.fps, qrbox: qrBoxSizeFor(window.innerWidth) },
        (decodedText) => {
          // Chỉ trigger 1 lần — decode loop vẫn chạy sau callback
          if (alreadyScanned) return;
          alreadyScanned = true;
          // Pause dừng decode nhưng giữ video alive → ScanPage chụp được frame
          try {
            scanner.pause(true);
          } catch {
            // pause() throw nếu scanner không ở trạng thái scanning — bỏ qua
          }
          const video = document.querySelector(`#${SCANNER_ID} video`);
          onScan(decodedText, { video });
        },
        () => {
          // per-frame decode miss (không có QR trong khung) — expected, bỏ qua
        }
      )
      .then(() => {
        // Unmount trước khi camera mở xong → tắt ngay, tránh camera chạy mồ côi.
        // stop() THROW ĐỒNG BỘ (không phải reject) nếu scanner không ở trạng thái
        // scanning → phải try/catch, .catch() không bắt được.
        if (cancelled) {
          try { scanner.stop().catch(() => {}); } catch { /* chưa scanning — bỏ qua */ }
          return;
        }
        setCameraState("active");
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[Camera]", err?.message || err);
        setCameraState("failed");
      });

    // E2E test hook — only available in dev builds
    if (import.meta.env.DEV) {
      window.__triggerQRScan = (text) => onScan(text);
    }

    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      if (import.meta.env.DEV) window.__triggerQRScan = undefined;
      // Tắt đèn trước khi đóng camera, tránh torch còn bật sau khi dừng scan
      if (trackRef.current) {
        setTorch(trackRef.current, false).catch(() => {});
      }
      // stop() THROW ĐỒNG BỘ nếu camera chưa từng start (StrictMode double-mount
      // gọi cleanup khi start() còn pending) — try/catch bắt buộc, .catch() không đủ.
      try {
        scanner
          .stop()
          .catch(() => {})
          .then(() => {
            try { scanner.clear(); } catch { /* element đã bị React gỡ */ }
          });
      } catch {
        try { scanner.clear(); } catch { /* element đã bị React gỡ */ }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sau khi camera active, poll cho đến khi video element + srcObject sẵn sàng
  // để lấy track cho zoom/torch/autofocus
  useEffect(() => {
    if (cameraState !== "active") return;

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
  }, [cameraState]);

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

  // Áp trạng thái đèn lên phần cứng + đồng bộ UI. Dùng chung cho auto lẫn thủ công.
  const applyTorch = useCallback(async (on) => {
    const ok = await setTorch(trackRef.current, on);
    if (ok) {
      setTorchOn(on);
    } else if (on) {
      // Bật thất bại (device từ chối) → ẩn nút để khỏi gây nhầm lẫn
      setTorchAvailable(false);
    }
    return ok;
  }, []);

  const toggleTorch = useCallback(async () => {
    const next = !torchOn;
    const ok = await applyTorch(next);
    // Đồng bộ với auto: tắt tay lúc tối → khóa auto-bật; bật tay → mở khóa
    if (ok) autoTorchRef.current?.setManual(next);
  }, [torchOn, applyTorch]);

  // Tự bật/tắt đèn theo độ sáng frame — chỉ chạy khi device hỗ trợ torch.
  // AmbientLightSensor gần như không khả dụng nên đo trực tiếp frame camera.
  useEffect(() => {
    if (!torchAvailable) return;

    autoTorchRef.current = createAutoTorchController();
    if (!lumCanvasRef.current) {
      lumCanvasRef.current = document.createElement("canvas");
    }

    lumPollRef.current = setInterval(async () => {
      const video = document.querySelector(`#${SCANNER_ID} video`);
      if (!video || !trackRef.current) return;

      const lum = estimateLuminance(video, lumCanvasRef.current);
      const action = autoTorchRef.current?.update(lum);
      if (action === "on") await applyTorch(true);
      else if (action === "off") await applyTorch(false);
    }, LUMINANCE_SAMPLE_MS);

    return () => clearInterval(lumPollRef.current);
  }, [torchAvailable, applyTorch]);

  const view = resolveCameraView(cameraState);
  const box  = qrBoxSizeFor(typeof window !== "undefined" ? window.innerWidth : 360);

  const stepZ      = zoomRange?.step ?? 0.5;
  const canZoomIn  = zoomRange && zoom < zoomRange.max;
  const canZoomOut = zoomRange && zoom > zoomRange.min;

  return (
    <div className="flex flex-col gap-3">
      {/* Camera viewport — bo góc, nền tối khi camera chưa lên */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-slate-950">
        {/* QUAN TRỌNG: div này phải render trước useEffect.
            min-h để div "visible" ngay cả khi video chưa gắn (spinner overlay + Playwright). */}
        <div id={SCANNER_ID} className="w-full min-h-[200px]" />

        {/* Spinner khi đang mở camera */}
        {view.showSpinner && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
            <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Đang mở camera...</span>
          </div>
        )}

        {/* Lỗi camera — ở lại trong component, user thoát bằng "Dừng Camera" */}
        {view.showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-200">
            <VideoOff className="w-10 h-10 text-red-400" aria-hidden />
            <p className="font-semibold">Không mở được camera</p>
            <p className="text-sm text-slate-400">
              Kiểm tra quyền camera trong cài đặt trình duyệt, hoặc đóng app khác
              đang dùng camera rồi bấm Dừng Camera và thử lại.
            </p>
          </div>
        )}

        {/* Khung ngắm: 4 góc bracket + scan line — chỉ khi camera active */}
        {view.showScanLine && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: box.width, height: box.height }}>
              {/* 4 góc bracket */}
              <div className="absolute top-0 left-0 w-9 h-9 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-9 h-9 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-9 h-9 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-9 h-9 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />
              {/* Scan line */}
              <div className="qr-scan-line absolute left-3 right-3 h-0.5 rounded-full bg-blue-400/90 shadow-[0_0_12px_2px_rgba(96,165,250,0.7)]" />
            </div>
          </div>
        )}
      </div>

      {/* Hint dưới camera */}
      {view.showScanLine && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 -mt-1">
          Đưa mã QR vào giữa khung
        </p>
      )}

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
          {torchOn
            ? <FlashlightOff className="w-5 h-5 flex-shrink-0" aria-hidden />
            : <Flashlight className="w-5 h-5 flex-shrink-0" aria-hidden />}
          <span>{torchOn ? "Tắt đèn" : "Bật đèn (tự động khi tối)"}</span>
        </button>
      )}

      {/* Zoom controls — chỉ hiện nếu device hỗ trợ hardware zoom */}
      {zoomRange && (
        <div className="flex items-center justify-center gap-5">
          <button
            disabled={!canZoomOut}
            onClick={() => applyZoom(Math.max(zoomRange.min, +(zoom - stepZ).toFixed(1)))}
            aria-label="Thu nhỏ"
            className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 active:bg-slate-300 dark:active:bg-slate-600 transition-colors flex items-center justify-center"
          >
            <Minus className="w-7 h-7" aria-hidden />
          </button>
          <span className="text-lg text-slate-600 dark:text-slate-300 w-16 text-center font-medium">
            {zoom.toFixed(1)}×
          </span>
          <button
            disabled={!canZoomIn}
            onClick={() => applyZoom(Math.min(zoomRange.max, +(zoom + stepZ).toFixed(1)))}
            aria-label="Phóng to"
            className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 active:bg-slate-300 dark:active:bg-slate-600 transition-colors flex items-center justify-center"
          >
            <Plus className="w-7 h-7" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
