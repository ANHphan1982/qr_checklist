import { useState, useEffect, useCallback } from "react";
import { QRScanner } from "../components/QRScanner";
import ScanResult from "../components/ScanResult";
import { postScan, postQueuedScan, pingServer } from "../lib/api";
import { getDeviceId } from "../lib/utils";
import { getCurrentPosition, checkGpsPermission } from "../lib/geolocation";
import { enqueue, flushQueue, queueSize } from "../lib/offlineQueue";

/**
 * 6 bước của một lần check-in:
 *  idle       → màn hình chờ, hiện nút bắt đầu + GPS hint
 *  permission → đang kiểm tra quyền GPS (ngay khi bấm, < 200ms)
 *  scanning   → camera mở, chờ user scan QR
 *  gps        → QR đã quét, đang lấy toạ độ GPS
 *  sending    → đang gọi API (cold-start warning sau 5s)
 *  done       → thành công, hiện card kết quả
 */

const PERMISSION_LABEL = {
  granted: { icon: "✅", text: "GPS đã sẵn sàng",             bg: "bg-green-50 border-green-200 text-green-800" },
  prompt:  { icon: "📍", text: "Sẽ hỏi quyền GPS khi scan",   bg: "bg-blue-50 border-blue-200 text-blue-800" },
  denied:  { icon: "⚠️", text: "GPS bị từ chối — check-in vẫn hoạt động, không xác thực vị trí", bg: "bg-yellow-50 border-yellow-200 text-yellow-800" },
  unknown: { icon: "📡", text: "Không kiểm tra được GPS",      bg: "bg-slate-50 border-slate-200 text-slate-600" },
};

const BUSY_LABEL = {
  permission: "🔍 Kiểm tra quyền GPS...",
  sending:    "⏳ Đang gửi dữ liệu...",
};

export default function ScanPage() {
  const [step, setStep] = useState("idle");
  const [gpsPermission, setGpsPermission] = useState(null);
  const [result, setResult] = useState(null);
  const [coldStart, setColdStart] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(queueSize());
  const [syncMsg, setSyncMsg] = useState(null); // thông báo sau khi sync

  // ---------------------------------------------------------------------------
  // Offline queue sync
  // ---------------------------------------------------------------------------

  const syncQueue = useCallback(async () => {
    if (queueSize() === 0) return;
    try {
      const { success, failed } = await flushQueue(postQueuedScan);
      setPendingCount(queueSize());
      if (success > 0) {
        setSyncMsg(`📤 Đã đồng bộ ${success} lần scan offline${failed > 0 ? `, ${failed} lỗi` : ""}`);
        setTimeout(() => setSyncMsg(null), 5000);
      }
    } catch {
      // im lặng, thử lại lần sau
    }
  }, []);

  // Theo dõi trạng thái mạng
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncQueue(); // tự đồng bộ ngay khi có mạng
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [syncQueue]);

  // Ping server + thử sync khi mount
  useEffect(() => {
    pingServer();
    if (navigator.onLine) syncQueue();
  }, [syncQueue]);

  // Kiểm tra quyền GPS lúc mount
  useEffect(() => {
    checkGpsPermission().then(setGpsPermission);
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStart = async () => {
    setResult(null);
    setStep("permission");
    const perm = await checkGpsPermission();
    setGpsPermission(perm);
    setStep("scanning");
  };

  const handleStop = () => setStep("idle");

  const handleScan = async (qrText) => {
    const location = qrText.trim();
    if (!location) return;

    setResult(null);

    // Lấy GPS
    setStep("gps");
    let gpsData = null;
    try {
      gpsData = await getCurrentPosition();
    } catch (gpsErr) {
      console.warn("[GPS]", gpsErr.message);
    }

    const scannedAt = new Date().toISOString();

    // Nếu không có mạng → lưu offline ngay
    if (!navigator.onLine) {
      const item = {
        location,
        device_id: getDeviceId(),
        scanned_at: scannedAt,
        lat: gpsData?.lat ?? null,
        lng: gpsData?.lng ?? null,
        accuracy: gpsData?.accuracy ?? null,
      };
      enqueue(item);
      setPendingCount(queueSize());
      setResult({
        status: "offline",
        message: "Đã lưu offline — sẽ tự đồng bộ khi có mạng",
        location,
        scanned_at: scannedAt,
      });
      setStep("done");
      return;
    }

    // Có mạng → gửi API bình thường
    setStep("sending");
    const coldTimer = setTimeout(() => setColdStart(true), 8000);

    try {
      const data = await postScan(location, getDeviceId(), gpsData, scannedAt);
      setResult({ status: "ok", location, scanned_at: scannedAt, ...data });
      setStep("done");
    } catch (err) {
      const isNetworkErr = !err.response; // không nhận được response → mất mạng
      const apiData = err?.response?.data || {};
      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");

      if (isNetworkErr || isTimeout) {
        // Mạng mất giữa chừng → lưu offline
        const item = {
          location,
          device_id: getDeviceId(),
          scanned_at: scannedAt,
          lat: gpsData?.lat ?? null,
          lng: gpsData?.lng ?? null,
          accuracy: gpsData?.accuracy ?? null,
        };
        enqueue(item);
        setPendingCount(queueSize());
        setResult({
          status: "offline",
          message: "Mất kết nối — đã lưu offline, sẽ tự đồng bộ khi có mạng",
          location,
          scanned_at: scannedAt,
        });
        setStep("done");
      } else {
        setResult({
          status: "error",
          message: apiData.message || err.message || "Lỗi server",
          outOfRange: apiData.code === "OUT_OF_RANGE",
          distance: apiData.distance,
        });
        setStep("idle");
      }
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
        <h1 className="text-3xl font-bold text-slate-800">Quét QR Check-in</h1>
        <p className="text-base text-slate-500 mt-1">
          Hướng camera vào mã QR tại trạm kiểm tra
        </p>
      </div>

      {/* Trạng thái mạng */}
      {!isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base flex items-center gap-2 bg-orange-50 border-orange-200 text-orange-800">
          <span>📵</span>
          <span>Không có mạng — scan vẫn hoạt động, dữ liệu lưu offline</span>
        </div>
      )}

      {/* Scan đang chờ đồng bộ */}
      {pendingCount > 0 && isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base flex items-center justify-between gap-2 bg-blue-50 border-blue-200 text-blue-800">
          <span>🕐 {pendingCount} scan chờ đồng bộ...</span>
          <button
            onClick={syncQueue}
            className="text-sm font-semibold underline"
          >
            Đồng bộ ngay
          </button>
        </div>
      )}

      {pendingCount > 0 && !isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base bg-slate-50 border-slate-200 text-slate-600">
          🕐 {pendingCount} scan đang chờ — sẽ gửi khi có mạng
        </div>
      )}

      {/* Thông báo sync thành công */}
      {syncMsg && (
        <div className="rounded-xl border px-4 py-3 text-base bg-green-50 border-green-200 text-green-800">
          {syncMsg}
        </div>
      )}

      {/* GPS permission hint */}
      {permInfo && !isBusy && isOnline && (
        <div className={`rounded-xl border px-4 py-3 text-base flex items-center gap-2 ${permInfo.bg}`}>
          <span>{permInfo.icon}</span>
          <span>{permInfo.text}</span>
        </div>
      )}

      {/* Cold-start warning */}
      {coldStart && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-base px-4 py-3">
          ⏳ Server đang khởi động (cold start ~30s), vui lòng chờ...
        </div>
      )}

      {/* Busy spinner */}
      {isBusy && (
        <div className="flex flex-col items-center gap-1 text-blue-600 py-3">
          <div className="flex items-center gap-2 text-base">
            <svg className="animate-spin h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {step === "gps"
              ? (isOnline ? "📍 Đang lấy vị trí GPS..." : "📍 Đang bắt tín hiệu vệ tinh...")
              : BUSY_LABEL[step]}
          </div>
          {step === "gps" && !isOnline && (
            <p className="text-xs text-slate-500">Không có mạng — có thể mất 30-60 giây, vui lòng chờ</p>
          )}
        </div>
      )}

      {/* Kết quả scan */}
      <ScanResult result={result} onDismiss={handleReset} />

      {/* Camera */}
      {isScanning && (
        <QRScanner onScan={handleScan} onError={handleScanError} />
      )}

      {/* Nút hành động */}
      {step === "idle" && (
        <button
          onClick={handleStart}
          className="w-full min-h-[56px] py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:bg-blue-700 transition-colors"
        >
          📷 Bắt đầu Scan
        </button>
      )}

      {isScanning && (
        <button
          onClick={handleStop}
          className="w-full min-h-[56px] py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold text-lg"
        >
          ⏹ Dừng Camera
        </button>
      )}

      {isDone && (
        <button
          onClick={handleReset}
          className="w-full min-h-[56px] py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:bg-blue-700 transition-colors"
        >
          📷 Quét tiếp
        </button>
      )}

      {/* Step indicator */}
      <StepIndicator step={step} />

      <p className="text-center text-sm text-slate-400">
        Yêu cầu HTTPS · Camera · GPS giúp xác thực vị trí
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
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
