import { useState, useEffect } from "react";
import { QRScanner } from "../components/QRScanner";
import ScanResult from "../components/ScanResult";
import { postScan } from "../lib/api";
import { getDeviceId } from "../lib/utils";
import { getCurrentPosition, checkGpsPermission } from "../lib/geolocation";

/**
 * 6 bước của một lần check-in:
 *  idle       → màn hình chờ, hiện nút bắt đầu + GPS hint
 *  permission → đang kiểm tra quyền GPS (ngay khi bấm, < 200ms)
 *  scanning   → camera mở, chờ user scan QR
 *  gps        → QR đã quét, đang lấy toạ độ GPS
 *  sending    → đang gọi API (cold-start warning sau 5s)
 *  done       → thành công, hiện card kết quả
 */

// Trạng thái quyền GPS → label hiển thị ở hint banner
const PERMISSION_LABEL = {
  granted:  { icon: "✅", text: "GPS đã sẵn sàng",             bg: "bg-green-50 border-green-200 text-green-800" },
  prompt:   { icon: "📍", text: "Sẽ hỏi quyền GPS khi scan",   bg: "bg-blue-50 border-blue-200 text-blue-800" },
  denied:   { icon: "⚠️", text: "GPS bị từ chối — check-in vẫn hoạt động, không xác thực vị trí", bg: "bg-yellow-50 border-yellow-200 text-yellow-800" },
  unknown:  { icon: "📡", text: "Không kiểm tra được GPS",      bg: "bg-slate-50 border-slate-200 text-slate-600" },
};

const BUSY_LABEL = {
  permission: "🔍 Kiểm tra quyền GPS...",
  gps:        "📍 Đang lấy vị trí GPS...",
  sending:    "⏳ Đang gửi dữ liệu...",
};

export default function ScanPage() {
  const [step, setStep] = useState("idle");
  const [gpsPermission, setGpsPermission] = useState(null); // null | 'granted' | 'prompt' | 'denied' | 'unknown'
  const [result, setResult] = useState(null);
  const [coldStart, setColdStart] = useState(false);

  // Kiểm tra quyền GPS lúc mount (passive — không xin quyền thật)
  useEffect(() => {
    checkGpsPermission().then(setGpsPermission);
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStart = async () => {
    setResult(null);
    setStep("permission");

    // Refresh permission state (< 200ms, không xin quyền thật)
    const perm = await checkGpsPermission();
    setGpsPermission(perm);

    setStep("scanning");
  };

  const handleStop = () => {
    setStep("idle");
  };

  const handleScan = async (qrText) => {
    const location = qrText.trim();
    if (!location) return;

    setResult(null);

    // Bước 4 — lấy GPS
    setStep("gps");
    let gpsData = null;
    try {
      gpsData = await getCurrentPosition();
    } catch (gpsErr) {
      // Không block check-in — chỉ ghi log, geo_status sẽ là 'no_gps'
      console.warn("[GPS]", gpsErr.message);
    }

    // Bước 5 — gửi API
    setStep("sending");
    const coldTimer = setTimeout(() => setColdStart(true), 5000);

    try {
      const data = await postScan(location, getDeviceId(), gpsData);
      setResult({ status: "ok", location, scanned_at: new Date().toISOString(), ...data });
      setStep("done");         // Bước 6
    } catch (err) {
      const apiData = err?.response?.data || {};
      setResult({
        status: "error",
        message: apiData.message || err.message || "Lỗi kết nối server",
        outOfRange: apiData.code === "OUT_OF_RANGE",
        distance: apiData.distance,
      });
      setStep("idle");
    } finally {
      clearTimeout(coldTimer);
      setColdStart(false);
    }
  };

  const handleScanError = (msg) => {
    setResult({ status: "error", message: msg });
    setStep("idle");
  };

  const handleReset = () => {
    setStep("idle");
    setResult(null);
  };

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const isBusy = step === "permission" || step === "gps" || step === "sending";
  const isScanning = step === "scanning";
  const isDone = step === "done";
  const permInfo = gpsPermission ? PERMISSION_LABEL[gpsPermission] : null;

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-5 w-full">

      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">Quét QR Check-in</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hướng camera vào mã QR tại trạm kiểm tra
        </p>
      </div>

      {/* GPS permission hint — hiện ở idle / done (không hiện khi đang busy) */}
      {permInfo && !isBusy && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm flex items-center gap-2 ${permInfo.bg}`}>
          <span>{permInfo.icon}</span>
          <span>{permInfo.text}</span>
        </div>
      )}

      {/* Cold-start warning */}
      {coldStart && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3">
          ⏳ Server đang khởi động (cold start ~30s), vui lòng chờ...
        </div>
      )}

      {/* Busy spinner + label */}
      {isBusy && (
        <div className="flex items-center justify-center gap-2 text-blue-600 text-sm py-2">
          <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {BUSY_LABEL[step]}
        </div>
      )}

      {/* Kết quả scan */}
      <ScanResult result={result} onDismiss={handleReset} />

      {/* Camera (bước 3) */}
      {isScanning && (
        <QRScanner onScan={handleScan} onError={handleScanError} />
      )}

      {/* Nút hành động theo bước */}
      {step === "idle" && (
        <button
          onClick={handleStart}
          className="w-full min-h-[44px] py-3 rounded-xl bg-blue-600 text-white font-semibold text-base active:bg-blue-700 transition-colors"
        >
          📷 Bắt đầu Scan
        </button>
      )}

      {isScanning && (
        <button
          onClick={handleStop}
          className="w-full min-h-[44px] py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-base"
        >
          ⏹ Dừng Camera
        </button>
      )}

      {isDone && (
        <button
          onClick={handleReset}
          className="w-full min-h-[44px] py-3 rounded-xl bg-blue-600 text-white font-semibold text-base active:bg-blue-700 transition-colors"
        >
          📷 Quét tiếp
        </button>
      )}

      {/* Step indicator */}
      <StepIndicator step={step} />

      <p className="text-center text-xs text-slate-400">
        Yêu cầu HTTPS · Camera · GPS giúp xác thực vị trí
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator (visual progress 1–6)
// ---------------------------------------------------------------------------

const STEPS = [
  { key: "idle",       label: "Chờ" },
  { key: "permission", label: "GPS" },
  { key: "scanning",   label: "Scan" },
  { key: "gps",        label: "Vị trí" },
  { key: "sending",    label: "Gửi" },
  { key: "done",       label: "Xong" },
];

function StepIndicator({ step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center justify-center gap-1">
      {STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                isDone
                  ? "bg-green-500 text-white"
                  : isActive
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {isDone ? "✓" : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${isDone ? "bg-green-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
