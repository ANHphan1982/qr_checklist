import { useEffect, useState, useRef } from "react";
import ScanHistory from "../components/ScanHistory";
import { getReports, getStationParamConfigs } from "../lib/api";
import { exportHistoryToExcel } from "../lib/exportExcel";

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
        configs.forEach((c) => { if (c.active) map[c.station_name] = c; });
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
            <button
              onClick={() => exportHistoryToExcel(logs, `checkin-${date}.xlsx`, paramConfigsRef.current)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold active:bg-green-700 transition-colors min-h-[44px]"
            >
              📥 Excel
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-base font-medium text-slate-600 dark:text-slate-300" htmlFor="date-picker">
          Ngày:
        </label>
        <input
          id="date-picker"
          type="date"
          value={date}
          max={todayVN()}
          onChange={(e) => setDate(e.target.value)}
          className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        />
        <button
          onClick={() => fetchLogs(date)}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-base font-semibold active:bg-blue-700 transition-colors min-h-[44px]"
        >
          Tải
        </button>
      </div>

      <ScanHistory logs={logs} loading={loading} error={error} />
    </div>
  );
}
