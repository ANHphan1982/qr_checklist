import { useState, useEffect, useCallback, useRef } from "react";
import { QRScanner } from "../components/QRScanner";
import ScanResult from "../components/ScanResult";
import { postScan, postQueuedScan, pingServer, checkConnectivity } from "../lib/api";
import { getDeviceId } from "../lib/utils";
import { getCurrentPosition, checkGpsPermission } from "../lib/geolocation";
import { enqueue, flushQueue, queueSize, clearQueue } from "../lib/offlineQueue";
import { classifyApiError } from "../lib/apiError";

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
  granted: { icon: "✅", text: "GPS đã sẵn sàng",             bg: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300" },
  prompt:  { icon: "📍", text: "Sẽ hỏi quyền GPS khi scan",   bg: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300" },
  denied:  { icon: "⚠️", text: "GPS bị từ chối — check-in vẫn hoạt động, không xác thực vị trí", bg: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300" },
  unknown: { icon: "📡", text: "Không kiểm tra được GPS",      bg: "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400" },
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
  const [syncMsg, setSyncMsg]     = useState(null);  // { text, ok }
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef              = useRef(false);   // ref để guard trong callback
  const [connTest, setConnTest]   = useState(null);  // { ok, detail } — kết quả test kết nối
  const [isTestingConn, setIsTestingConn] = useState(false);

  // ---------------------------------------------------------------------------
  // Offline queue sync
  // ---------------------------------------------------------------------------

  const syncQueue = useCallback(async () => {
    if (queueSize() === 0) return;
    if (isSyncingRef.current) return; // tránh double-click

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const { success, failed } = await flushQueue(postQueuedScan);
      setPendingCount(queueSize());
      if (success > 0) {
        setSyncMsg({
          ok: true,
          text: `📤 Đã đồng bộ ${success} scan offline${failed > 0 ? ` — ${failed} lỗi, sẽ thử lại` : ""}`,
        });
      } else if (failed > 0) {
        setSyncMsg({
          ok: false,
          text: `⚠️ Không đồng bộ được (${failed} scan) — nhấn "Test kết nối" để chẩn đoán`,
        });
      }
    } catch (err) {
      const detail = err?.response?.status
        ? `HTTP ${err.response.status}`
        : err?.code === "ECONNABORTED" ? "Timeout" : (err?.message || "không xác định");
      setSyncMsg({ ok: false, text: `⚠️ Lỗi đồng bộ: ${detail} — nhấn "Test kết nối" để chẩn đoán` });
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setTimeout(() => setSyncMsg(null), 8000);
    }
  }, []); // deps rỗng — dùng ref để guard, tránh re-run các effect

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

  const handleTestConn = async () => {
    setIsTestingConn(true);
    setConnTest(null);
    const result = await checkConnectivity();
    setConnTest(result);
    setIsTestingConn(false);
    setTimeout(() => setConnTest(null), 20000);
  };

  const handleClearQueue = () => {
    if (!window.confirm(`Xóa ${pendingCount} scan đang chờ? Dữ liệu sẽ mất vĩnh viễn.`)) return;
    clearQueue();
    setPendingCount(0);
    setSyncMsg(null);
  };

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
      const classified = classifyApiError(err, navigator.onLine);

      if (classified.shouldQueue) {
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
          message: classified.message,
          location,
          scanned_at: scannedAt,
        });
        setStep("done");
      } else {
        const apiData = classified.data || {};
        setResult({
          status: "error",
          message: classified.message,
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
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Quét QR Check-in</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
          Hướng camera vào mã QR tại trạm kiểm tra
        </p>
      </div>

      {/* Trạng thái mạng */}
      {!isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base flex items-center gap-2 bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300">
          <span>📵</span>
          <span>Không có mạng — scan vẫn hoạt động, dữ liệu lưu offline</span>
        </div>
      )}

      {/* Scan đang chờ đồng bộ */}
      {pendingCount > 0 && isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base flex items-center justify-between gap-2 bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
          <span>🕐 {pendingCount} scan chờ đồng bộ</span>
          <div className="flex items-center gap-2">
            <button
              onClick={syncQueue}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60 active:bg-blue-700 transition-colors"
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Đang gửi...
                </>
              ) : "Đồng bộ ngay"}
            </button>
            <button
              onClick={handleClearQueue}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-semibold disabled:opacity-60 active:bg-red-200 transition-colors dark:bg-red-900/30 dark:text-red-300"
              title="Xóa tất cả scan đang chờ"
            >
              Xóa
            </button>
          </div>
        </div>
      )}

      {pendingCount > 0 && !isOnline && (
        <div className="rounded-xl border px-4 py-3 text-base bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
          🕐 {pendingCount} scan đang chờ — sẽ gửi khi có mạng
        </div>
      )}

      {/* Thông báo kết quả sync */}
      {syncMsg && (
        <div className={`rounded-xl border px-4 py-3 text-base ${
          syncMsg.ok
            ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
        }`}>
          {syncMsg.text}
        </div>
      )}

      {/* Nút và kết quả Test kết nối — hiện khi có scan chờ hoặc sync thất bại */}
      {(pendingCount > 0 || syncMsg?.ok === false) && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleTestConn}
            disabled={isTestingConn}
            className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold disabled:opacity-60 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
          >
            {isTestingConn ? "⏳ Đang kiểm tra..." : "🔌 Test kết nối server"}
          </button>
          {connTest && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-mono break-all ${
              connTest.ok
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
                : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
            }`}>
              {connTest.ok ? "✅ " : "❌ "}{connTest.detail}
            </div>
          )}
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
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300 text-base px-4 py-3">
          ⏳ Server đang khởi động (cold start ~30s), vui lòng chờ...
        </div>
      )}

      {/* Busy spinner */}
      {isBusy && (
        <div className="flex flex-col items-center gap-1 text-blue-600 dark:text-blue-400 py-3">
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Không có mạng — có thể mất 30-60 giây, vui lòng chờ</p>
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
          className="w-full min-h-[56px] py-4 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-lg active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
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

      <p className="text-center text-sm text-slate-400 dark:text-slate-500">
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
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
              }`}
            >
              {isDone ? "✓" : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${isDone ? "bg-green-400" : "bg-slate-200 dark:bg-slate-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
