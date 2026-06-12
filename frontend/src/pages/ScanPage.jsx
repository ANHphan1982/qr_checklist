import { useState, useEffect, useCallback, useRef } from "react";
import { QRScanner } from "../components/QRScanner";
import ScanResult from "../components/ScanResult";
import { postScan, postQueuedScan, pingServer, checkConnectivity } from "../lib/api";
import { getDeviceId } from "../lib/utils";
import { getCurrentPosition, checkGpsPermission, startGpsWatch, saveLastFix, loadLastFix } from "../lib/geolocation";
import { enqueue, flushQueue, queueSize, clearQueue, updateLastItem, hasQueueItem, updateItemByQueuedAt } from "../lib/offlineQueue";
import { classifyApiError } from "../lib/apiError";
import OperationalParamsModal from "../components/OperationalParamsModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { patchScanParams, getStationParamConfigs } from "../lib/api";
import { mergeWithBuiltin } from "../lib/builtinConfigs";
import { resolveStationName } from "../lib/stationsConfig";
import { savePendingParams, loadPendingParams, clearPendingParams } from "../lib/pendingParams";
import { resolveStatusBanner } from "../lib/statusBanner";
import { resolveButtonState } from "../lib/buttonState";
import { resolveStepDisplay } from "../lib/stepDisplay";
import { triggerVibration } from "../lib/haptics";
import { Camera, Square, Clock, Trash2, PlugZap, Satellite, UploadCloud } from "lucide-react";
import Button from "../components/ui/Button";
import Banner from "../components/ui/Banner";
/**
 * 6 bước của một lần check-in:
 *  idle       → màn hình chờ, hiện nút bắt đầu + GPS hint
 *  permission → đang kiểm tra quyền GPS (ngay khi bấm, < 200ms)
 *  scanning   → camera mở, GPS watch đã chạy từ lúc mount; nếu chưa fix hiện banner 30-90s
 *  gps        → QR đã quét, đọc fix mới nhất từ watch (thường tức thời)
 *  sending    → đang gọi API (cold-start warning sau 5s)
 *  done       → thành công, hiện card kết quả
 *
 * GPS watch (watchPosition) chạy liên tục từ lúc mount để giữ chip GPS warm.
 * Quan trọng cho thiết bị WiFi nội bộ không có internet → không có A-GPS,
 * cold-fix lần đầu 30–90s. Watch giúp các lần scan sau gần như tức thời.
 */

// Tuổi tối đa của fix từ watch để dùng cho 1 lần scan (ms).
// 30s đủ để chấp nhận fix vừa cũ, vẫn còn chính xác cho check-in tại chỗ.
const GPS_FIX_MAX_AGE_MS = 30000;

// Config trạm (shape mới) có dạng { station_name, params: [...] }.
// Chỉ hiện modal khi trạm có ít nhất 1 thông số cần nhập.
function hasParams(cfg) {
  return !!(cfg && Array.isArray(cfg.params) && cfg.params.length > 0);
}

// Item đưa vào offline queue — giữ nguyên scanned_at để server dedupe khi retry.
function buildQueueItem(location, gpsData, scannedAt) {
  return {
    location,
    device_id: getDeviceId(),
    scanned_at: scannedAt,
    lat: gpsData?.lat ?? null,
    lng: gpsData?.lng ?? null,
    accuracy: gpsData?.accuracy ?? null,
    geo_cached: gpsData?.cached || undefined,
    cache_age_ms: gpsData?.cache_age_ms,
  };
}


export default function ScanPage() {
  const [step, setStep] = useState("idle");
  const [gpsPermission, setGpsPermission] = useState(null);
  const [result, setResult] = useState(null);
  const [pendingParamsScanId, setPendingParamsScanId] = useState(null);
  const [pendingParamConfig,  setPendingParamConfig]  = useState(null);
  const [pendingQueuedAt,     setPendingQueuedAt]     = useState(null);
  // map: station_name → { station_name, params: [...] } (multi-param)
  // Khởi tạo từ cache localStorage để dùng được khi offline ngay từ đầu session
  const [stationParamConfigs, setStationParamConfigs] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("qr_station_param_configs") || "{}");
      return mergeWithBuiltin(cached);
    } catch (_) {
      return mergeWithBuiltin({});
    }
  });
  const paramCacheCount = Object.keys(stationParamConfigs).length;
  const [coldStart, setColdStart] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(queueSize());
  const [syncMsg, setSyncMsg]     = useState(null);  // { text, ok }
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef              = useRef(false);   // ref để guard trong callback
  const [connTest, setConnTest]   = useState(null);  // { ok, detail } — kết quả test kết nối
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // GPS watch: chạy liên tục từ lúc mount để giữ chip GPS warm.
  // latestGpsRef = fix gần nhất {lat,lng,accuracy,ts} | null
  const latestGpsRef = useRef(null);
  const stopGpsWatchRef = useRef(null);
  // null = chưa bắt đầu | 'warming' | 'ready' | 'failed'
  const [gpsWatchState, setGpsWatchState] = useState(null);

  // Wake Lock: giữ màn hình sáng khi camera mở để OS không suspend chip GPS.
  const wakeLockRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Offline queue sync
  // ---------------------------------------------------------------------------

  // isAuto=true → im lặng khi lỗi (auto-sync khi mount/online)
  // isAuto=false → hiện thông báo lỗi (manual sync khi bấm nút)
  const syncQueue = useCallback(async (isAuto = false) => {
    if (queueSize() === 0) return;
    if (isSyncingRef.current) return; // tránh double-click

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncMsg(null);
    let didSetMsg = false;
    try {
      const { success, failed } = await flushQueue(postQueuedScan);
      setPendingCount(queueSize());
      if (success > 0) {
        setSyncMsg({
          ok: true,
          text: `Đã đồng bộ ${success} scan offline${failed > 0 ? ` — ${failed} lỗi, sẽ thử lại` : ""}`,
        });
        didSetMsg = true;
      } else if (failed > 0 && !isAuto) {
        // Chỉ hiện lỗi khi user bấm nút — auto sync im lặng để tránh nhiễu
        setSyncMsg({
          ok: false,
          text: `Không đồng bộ được (${failed} scan) — server chưa sẵn sàng, sẽ tự thử lại`,
        });
        didSetMsg = true;
      }
    } catch (err) {
      if (!isAuto) {
        const detail = err?.response?.status
          ? `HTTP ${err.response.status}`
          : err?.code === "ECONNABORTED" ? "Timeout" : (err?.message || "không xác định");
        setSyncMsg({ ok: false, text: `Lỗi đồng bộ: ${detail} — nhấn "Test kết nối" để chẩn đoán` });
        didSetMsg = true;
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      if (didSetMsg) setTimeout(() => setSyncMsg(null), 8000);
    }
  }, []); // deps rỗng — dùng ref để guard, tránh re-run các effect

  // Load + cache cấu hình thông số vận hành. Gọi khi mount / có mạng trở lại /
  // race-condition guard lúc scan. Trả về map đã merge để caller lookup ngay,
  // null nếu fetch fail (offline, server lỗi) — khi đó giữ nguyên config hiện tại.
  const refreshParamConfigs = useCallback(async () => {
    try {
      const configs = await getStationParamConfigs();
      const map = {};
      // Endpoint đã lọc sẵn trạm có thông số active → map trực tiếp theo tên trạm.
      configs.forEach((c) => { map[c.station_name] = c; });
      const merged = mergeWithBuiltin(map); // builtin là fallback, API thắng
      setStationParamConfigs(merged);
      try { localStorage.setItem("qr_station_param_configs", JSON.stringify(map)); } catch (_) {}
      return merged;
    } catch (_) {
      return null;
    }
  }, []);

  // Theo dõi trạng thái mạng
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncQueue(true); // auto sync — im lặng khi lỗi
      refreshParamConfigs(); // refresh cache khi có mạng trở lại
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [syncQueue, refreshParamConfigs]);

  // Ping server + thử sync khi mount
  useEffect(() => {
    pingServer();
    if (navigator.onLine) syncQueue(true); // auto sync lúc mount — im lặng khi lỗi
  }, [syncQueue]);

  // Load cấu hình thông số vận hành lúc mount (có mạng hay không đều thử,
  // nếu thất bại thì stationParamConfigs giữ nguyên giá trị từ localStorage)
  useEffect(() => {
    refreshParamConfigs();
  }, [refreshParamConfigs]);

  // Hướng B: restore modal thông số nếu user thoát app trước khi nhập.
  // Kiểm tra localStorage xem có pending params chưa hoàn thành không.
  // Chỉ restore nếu queue item vẫn còn (chưa được sync lên server).
  useEffect(() => {
    const pending = loadPendingParams();
    if (!pending) return;
    const { stationName, config, queuedAt } = pending;
    if (!hasQueueItem(queuedAt)) {
      clearPendingParams();
      return;
    }
    setPendingParamsScanId("offline");
    setPendingParamConfig(config);
    setPendingQueuedAt(queuedAt);
    setResult({ status: "offline", message: "Vui lòng nhập thông số còn thiếu", location: stationName, scanned_at: "" });
    setStep("params");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kiểm tra quyền + bắt đầu GPS watch lúc mount.
  // watchPosition giữ chip GPS chạy liên tục → fix luôn có sẵn cho scan kế tiếp.
  // Nếu perm là "prompt", lệnh watchPosition dưới đây cũng sẽ tự kích hoạt popup
  // hỏi quyền — không cần gọi getCurrentPosition thêm.
  useEffect(() => {
    let cancelled = false;

    checkGpsPermission().then((perm) => {
      if (cancelled) return;
      setGpsPermission(perm);
      if (perm === "denied" || !navigator.geolocation) return;

      setGpsWatchState("warming");
      stopGpsWatchRef.current = startGpsWatch({
        onUpdate: (pos) => {
          latestGpsRef.current = pos;
          saveLastFix(pos); // cache cho lần scan kế nếu chip GPS fail tại đó
          setGpsWatchState("ready");
          // Sau lần fix đầu, refresh perm state (popup đã được trả lời)
          checkGpsPermission().then((p) => !cancelled && setGpsPermission(p));
        },
        onError: (err) => {
          console.warn("[GPS watch]", err.message);
          setGpsWatchState((s) => (s === "ready" ? "ready" : "failed"));
          checkGpsPermission().then((p) => !cancelled && setGpsPermission(p));
        },
      });
    });

    return () => {
      cancelled = true;
      stopGpsWatchRef.current?.();
      stopGpsWatchRef.current = null;
    };
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
    setConfirmClearOpen(false);
    clearQueue();
    setPendingCount(0);
    setSyncMsg(null);
  };

  // Wake Lock — giữ màn hình sáng khi đang scan để OS không suspend chip GPS.
  // Browser API mới, không phải máy nào cũng có → fail im lặng nếu không hỗ trợ.
  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current || !("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      wakeLockRef.current.addEventListener?.("release", () => {
        wakeLockRef.current = null;
      });
    } catch (err) {
      console.warn("[WakeLock]", err.message);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // Acquire wake lock trong toàn bộ flow scan, release khi về idle/done.
  // Đảm bảo OS không suspend chip GPS khi user đang dùng app.
  useEffect(() => {
    const active = step === "permission" || step === "scanning" || step === "gps" || step === "sending" || step === "params";
    if (active) acquireWakeLock();
    else releaseWakeLock();
  }, [step, acquireWakeLock, releaseWakeLock]);

  // Khi user back ra rồi quay lại tab, Wake Lock bị browser thu hồi → xin lại nếu đang scan.
  useEffect(() => {
    const onVisible = () => {
      const active = step === "permission" || step === "scanning" || step === "gps" || step === "sending" || step === "params";
      if (document.visibilityState === "visible" && active) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [step, acquireWakeLock]);

  // Release wake lock khi unmount.
  useEffect(() => () => releaseWakeLock(), [releaseWakeLock]);

  const handleStart = async () => {
    setResult(null);
    setStep("permission");
    const perm = await checkGpsPermission();
    setGpsPermission(perm);

    // GPS watch đã chạy từ lúc mount → không cần warm-up thêm ở đây.
    // Nếu watch bị stop (perm denied trước đây, giờ user cấp lại), khởi động lại.
    if (perm !== "denied" && navigator.geolocation && !stopGpsWatchRef.current) {
      setGpsWatchState("warming");
      stopGpsWatchRef.current = startGpsWatch({
        onUpdate: (pos) => {
          latestGpsRef.current = pos;
          saveLastFix(pos);
          setGpsWatchState("ready");
        },
        onError: (err) => {
          console.warn("[GPS watch]", err.message);
          setGpsWatchState((s) => (s === "ready" ? "ready" : "failed"));
        },
      });
    }

    setStep("scanning");
  };

  const handleStop = () => {
    setStep("idle");
  };

  // Lưu scan vào offline queue + mở modal thông số nếu trạm có cấu hình.
  // Dùng chung cho 2 nhánh: !navigator.onLine và API fail (shouldQueue).
  const queueOfflineScan = (location, stationName, gpsData, scannedAt, message) => {
    const queuedAt = enqueue(buildQueueItem(location, gpsData, scannedAt));
    setPendingCount(queueSize());
    triggerVibration("offline");
    setResult({
      status: "offline",
      message,
      location: stationName, // tên trạm đã resolve alias để hiển thị đúng
      scanned_at: scannedAt,
    });
    const paramConfig = stationParamConfigs[stationName]; // lookup bằng tên trạm, không phải alias
    if (hasParams(paramConfig)) {
      // Persist pending params → modal không bị mất nếu user thoát app
      savePendingParams(stationName, paramConfig, queuedAt);
      setPendingParamsScanId("offline");
      setPendingParamConfig(paramConfig);
      setPendingQueuedAt(queuedAt);
      setStep("params");
    } else {
      setStep("done");
    }
  };

  const handleScan = async (qrText, opts = {}) => {
    const location = qrText.trim();
    if (!location) return;
    // Resolve QR alias → tên trạm thật (vd: "052-LI-042B" → "TK-5211A").
    // Cần cho offline path vì server không xử lý alias khi chưa sync.
    // Online path dùng data.location từ server response (đã resolve).
    const stationName = resolveStationName(location);

    setResult(null);

    // Lấy GPS — thứ tự ưu tiên:
    //  1. Fix gần nhất từ watchPosition (warm, < 30s)
    //  2. getCurrentPosition trực tiếp (cold-fix)
    //  3. Cache localStorage (fallback khi chip GPS fail tại điểm này)
    setStep("gps");
    let gpsData = null;
    try {
      const latest = latestGpsRef.current;
      if (latest && Date.now() - latest.ts < GPS_FIX_MAX_AGE_MS) {
        gpsData = latest;
      } else {
        gpsData = await getCurrentPosition();
        saveLastFix({ ...gpsData, ts: Date.now() });
      }
    } catch (gpsErr) {
      console.warn("[GPS]", gpsErr.message);
      // Fallback: dùng fix cũ trong localStorage nếu < 30 phút.
      // Server nhận geo_cached=true để admin biết đây là vị trí cache, không phải GPS thật.
      const cached = loadLastFix();
      if (cached) {
        gpsData = {
          lat: cached.lat,
          lng: cached.lng,
          accuracy: cached.accuracy,
          cached: true,
          cache_age_ms: Date.now() - cached.ts,
        };
      }
    }

    const scannedAt = new Date().toISOString();

    // Nếu không có mạng → lưu offline ngay
    if (!navigator.onLine) {
      queueOfflineScan(location, stationName, gpsData, scannedAt,
        "Đã lưu offline — sẽ tự đồng bộ khi có mạng");
      return;
    }

    // Có mạng → gửi API bình thường
    setStep("sending");
    const coldTimer = setTimeout(() => setColdStart(true), 8000);

    try {
      const data = await postScan(location, getDeviceId(), gpsData, scannedAt);
      triggerVibration("ok");
      setResult({ status: "ok", location, scanned_at: scannedAt, ...data });
      const resolvedLocation = data.location || location;
      let paramConfig = stationParamConfigs[resolvedLocation];

      // Race condition guard: stationParamConfigs có thể rỗng nếu user scan
      // ngay sau khi có mạng (refreshParamConfigs chưa kịp resolve).
      // Re-fetch tại chỗ để không bỏ lỡ modal thông số.
      if (!hasParams(paramConfig)) {
        const merged = await refreshParamConfigs();
        if (merged) paramConfig = merged[resolvedLocation];
        // fetch thất bại (merged=null) — tiếp tục không có modal
      }

      if (hasParams(paramConfig) && data.scan_id) {
        setPendingParamsScanId(data.scan_id);
        setPendingParamConfig(paramConfig);
        setStep("params");
      } else {
        setStep("done");
      }
    } catch (err) {
      const classified = classifyApiError(err, navigator.onLine);

      if (classified.shouldQueue) {
        // navigator.onLine có thể là true khi WiFi nội bộ không có internet thực sự.
        // Khi đó API fail → shouldQueue=true: xử lý y hệt nhánh !navigator.onLine.
        queueOfflineScan(location, stationName, gpsData, scannedAt, classified.message);
      } else {
        const apiData = classified.data || {};
        const resolvedLocation = apiData.location || location;
        triggerVibration("error");
        setResult({
          status: "error",
          message: classified.message,
          outOfRange: apiData.code === "OUT_OF_RANGE",
          distance: apiData.distance,
          location: resolvedLocation,
        });
        let paramConfig = stationParamConfigs[resolvedLocation];

        // Race condition guard: giống nhánh success — re-fetch nếu cache rỗng
        // và scan đã được lưu DB (có scan_id).
        if (!hasParams(paramConfig) && apiData.code === "OUT_OF_RANGE" && apiData.scan_id) {
          const merged = await refreshParamConfigs();
          if (merged) paramConfig = merged[resolvedLocation];
        }

        if (apiData.code === "OUT_OF_RANGE" && hasParams(paramConfig) && apiData.scan_id) {
          setPendingParamsScanId(apiData.scan_id);
          setPendingParamConfig(paramConfig);
          setStep("params");
        } else {
          setStep("idle");
        }
      }
    } finally {
      clearTimeout(coldTimer);
      setColdStart(false);
    }
  };

  const handleReset = () => {
    clearPendingParams();
    setStep("idle");
    setResult(null);
    setPendingParamsScanId(null);
    setPendingParamConfig(null);
    setPendingQueuedAt(null);
  };

  const handleParamsSubmit = async (params) => {
    if (pendingParamsScanId === "offline") {
      // Offline: ghi params vào item đúng trong queue theo queued_at
      if (pendingQueuedAt) {
        updateItemByQueuedAt(pendingQueuedAt, params);
      } else {
        updateLastItem(params); // fallback cho items cũ chưa có queuedAt link
      }
      clearPendingParams();
    } else if (pendingParamsScanId) {
      try {
        await patchScanParams(pendingParamsScanId, params);
      } catch (_) {
        // Không block user — params là thông tin bổ sung, không bắt buộc
      }
    }
    setPendingParamsScanId(null);
    setPendingParamConfig(null);
    setPendingQueuedAt(null);
    setStep("done");
  };

  const handleParamsSkip = () => {
    clearPendingParams();
    setPendingParamsScanId(null);
    setPendingParamConfig(null);
    setPendingQueuedAt(null);
    setStep("done");
  };

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const isScanning = step === "scanning";
  const isParams = step === "params";

  const banner     = resolveStatusBanner({ isOnline, syncMsg, coldStart, gpsPermission, step, paramCacheCount });
  const btnState   = resolveButtonState(step);
  const stepDisplay = resolveStepDisplay(step);

  const handleBtnClick = step === "scanning" ? handleStop : step === "done" ? handleReset : handleStart;

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

      {/* Smart status banner — 1 block thay 5 banners */}
      {banner && <StatusBanner banner={banner} />}

      {/* Pending queue controls — gộp online/offline row + test connection */}
      {pendingCount > 0 && (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl border px-4 py-3 text-base flex items-center justify-between gap-2 bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5 flex-shrink-0" aria-hidden />
              {pendingCount} scan {isOnline ? "chờ đồng bộ" : "đang chờ — sẽ gửi khi có mạng"}
            </span>
            {isOnline && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  icon={UploadCloud}
                  loading={isSyncing}
                  onClick={() => syncQueue(false)}
                >
                  {isSyncing ? "Đang gửi..." : "Đồng bộ"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  disabled={isSyncing}
                  onClick={() => setConfirmClearOpen(true)}
                  title="Xóa tất cả scan đang chờ"
                >
                  Xóa
                </Button>
              </div>
            )}
          </div>

          {/* Test kết nối — chỉ hiện khi có pending */}
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={PlugZap}
              loading={isTestingConn}
              onClick={handleTestConn}
              className="w-full"
            >
              {isTestingConn ? "Đang kiểm tra..." : "Test kết nối server"}
            </Button>
            {connTest && (
              <Banner variant={connTest.ok ? "success" : "error"}>
                <span className="text-sm font-mono break-all">{connTest.detail}</span>
              </Banner>
            )}
          </div>
        </div>
      )}

      {/* GPS watch banner — context-specific, chỉ khi camera mở */}
      {isScanning && gpsWatchState === "warming" && (
        <Banner variant="amber" icon={Satellite}>
          <span>
            GPS đang bắt tín hiệu vệ tinh, có thể mất <strong>30-90 giây</strong> nếu không có internet.
            Hãy đứng ngoài trời hoặc gần cửa sổ. Sau lần đầu, các lần scan tiếp sẽ nhanh hơn.
          </span>
        </Banner>
      )}
      {isScanning && gpsWatchState === "failed" && (
        <Banner variant="warning">
          <span>
            GPS chưa bắt được tín hiệu — check-in vẫn hoạt động nhưng không xác thực vị trí.
            Thử ra gần cửa sổ để chip GPS bắt vệ tinh.
          </span>
        </Banner>
      )}

      {/* Camera */}
      {isScanning && (
        <QRScanner onScan={handleScan} />
      )}

      {/* Confirm xóa queue — thay window.confirm */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="Xóa scan đang chờ?"
        message={`${pendingCount} scan chưa đồng bộ sẽ bị xóa vĩnh viễn, không thể khôi phục.`}
        confirmLabel="Xóa vĩnh viễn"
        cancelLabel="Giữ lại"
        danger
        onConfirm={handleClearQueue}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* Kết quả scan */}
      <ScanResult result={result} onDismiss={handleReset} />

      {/* Operational params modal */}
      {isParams && result?.location && pendingParamConfig && (
        <OperationalParamsModal
          location={result.location}
          config={pendingParamConfig}
          onSubmit={handleParamsSubmit}
          onSkip={handleParamsSkip}
        />
      )}

      {/* Unified action button — loading state từ step hiện tại */}
      {btnState.show && (
        <Button
          size="xl"
          variant={btnState.variant === "secondary" ? "secondary" : "primary"}
          loading={btnState.loading}
          icon={btnState.icon === "camera" ? Camera : btnState.icon === "stop" ? Square : undefined}
          onClick={handleBtnClick}
          data-scan-btn
          className="w-full"
        >
          {btnState.label}
        </Button>
      )}

      {/* Step progress bar — ẩn khi idle/done */}
      <StepProgressBar stepDisplay={stepDisplay} />

      <p className="text-center text-sm text-slate-400 dark:text-slate-500">
        Yêu cầu HTTPS · Camera · GPS giúp xác thực vị trí
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBanner — render banner theo variant từ resolveStatusBanner
// ---------------------------------------------------------------------------

function StatusBanner({ banner }) {
  return (
    <Banner variant={banner.variant}>
      <span>{banner.text}</span>
      {banner.extra && (
        <span className="text-sm font-semibold mt-0.5">{banner.extra}</span>
      )}
    </Banner>
  );
}

// ---------------------------------------------------------------------------
// StepProgressBar — label + progress bar thay cho 7 bước nhỏ
// ---------------------------------------------------------------------------

function StepProgressBar({ stepDisplay }) {
  if (!stepDisplay.shouldShow) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span className="font-medium">{stepDisplay.label}</span>
        <span>{stepDisplay.progressPct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${stepDisplay.progressPct}%` }}
        />
      </div>
    </div>
  );
}
