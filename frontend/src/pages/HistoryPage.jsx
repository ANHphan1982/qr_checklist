import { useEffect, useState, useRef } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import ScanHistory from "../components/ScanHistory";
import Button from "../components/ui/Button";
import { getReports, getStationParamConfigs } from "../lib/api";
import { exportHistoryToExcel } from "../lib/exportExcel";
import { addDays, canGoNext } from "../lib/dateNav";

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function HistoryPage() {
  const [date, setDate]       = useState(todayVN());
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // paramConfigs: map station_name → { param_low, param_high, ... }
  // Fetch từ API khi mount; fallback về localStorage nếu offline
  const paramConfigsRef = useRef({});

  useEffect(() => {
    getStationParamConfigs()
      .then((configs) => {
        const map = {};
        configs.forEach((c) => { map[c.station_name] = c; });
        paramConfigsRef.current = map;
      })
      .catch(() => {
        try {
          const cached = JSON.parse(localStorage.getItem("qr_station_param_configs") || "{}");
          paramConfigsRef.current = cached;
        } catch (_) {}
      });
  }, []);

  const fetchLogs = async (d) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReports(d);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.message || "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(date); }, [date]);

  const today = todayVN();
  const nextEnabled = canGoNext(date, today);
  const isToday = date === today;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Lịch sử Check-in
        </h1>
        <div className="flex items-center gap-2">
          {!loading && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {total} lượt
            </span>
          )}
          {logs.length > 0 && (
            <Button
              size="sm"
              variant="success"
              icon={Download}
              onClick={() => exportHistoryToExcel(logs, `checkin-${date}.xlsx`, paramConfigsRef.current)}
            >
              Excel
            </Button>
          )}
        </div>
      </div>

      {/* Điều hướng ngày: ◀ hôm trước | date picker | hôm sau ▶ */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDate(addDays(date, -1))}
          aria-label="Hôm trước"
          className="w-11 h-11 flex-shrink-0 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>
        <input
          id="date-picker"
          type="date"
          aria-label="Chọn ngày"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        />
        <button
          onClick={() => nextEnabled && setDate(addDays(date, 1))}
          disabled={!nextEnabled}
          aria-label="Hôm sau"
          className="w-11 h-11 flex-shrink-0 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center active:bg-slate-100 dark:active:bg-slate-700 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" aria-hidden />
        </button>
      </div>

      {isToday && !loading && (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center -mt-2">Hôm nay</p>
      )}

      <ScanHistory logs={logs} loading={loading} error={error} />
    </div>
  );
}
