import { useEffect, useMemo, useState, useRef } from "react";
import { Download, ChevronLeft, ChevronRight, Search } from "lucide-react";
import ScanHistory from "../components/ScanHistory";
import Button from "../components/ui/Button";
import { getReports, getStationParamConfigs } from "../lib/api";
// exportExcel (kéo theo xlsx ~800KB) nạp lười bằng import() khi bấm nút Excel.
import { addDays, canGoNext } from "../lib/dateNav";
import { summarizeLogs, filterLogs } from "../lib/historyFilter";

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Các bộ lọc nhanh — key khớp historyFilter.filterLogs. `count` lấy từ summary.
const FILTERS = [
  { key: "all",          label: "Tất cả",       countKey: "total" },
  { key: "out_of_range", label: "Ngoài phạm vi", countKey: "outOfRange" },
  { key: "breach",       label: "Vượt ngưỡng",   countKey: "breach" },
  { key: "no_gps",       label: "Không GPS",     countKey: "noGps" },
];

export default function HistoryPage() {
  const [date, setDate]       = useState(todayVN());
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [category, setCategory] = useState("all");
  const [query, setQuery]       = useState("");

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

  const handleExport = async () => {
    try {
      const { exportHistoryToExcel } = await import("../lib/exportExcel");
      exportHistoryToExcel(filtered, `checkin-${date}.xlsx`, paramConfigsRef.current);
    } catch (_) {
      // import() fail khi offline mà chunk chưa được SW cache
      setError("Không tạo được file Excel — kiểm tra kết nối mạng rồi thử lại");
    }
  };

  // Thống kê ngày + danh sách đã lọc (client-side, trên logs đã tải).
  const summary  = useMemo(() => summarizeLogs(logs), [logs]);
  const filtered = useMemo(() => filterLogs(logs, { category, query }), [logs, category, query]);

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
              onClick={handleExport}
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

      {/* Thẻ thống kê ngày — nhìn phát biết tình hình */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatPill label="Tổng" value={summary.total} tone="slate" />
          <StatPill label="Đúng vị trí" value={summary.ok} tone="emerald" />
          <StatPill label="Ngoài PV" value={summary.outOfRange} tone="red" />
          <StatPill label="Vượt ngưỡng" value={summary.breach} tone="amber" />
        </div>
      )}

      {/* Bộ lọc nhanh + tìm theo tên trạm — chỉ hiện khi có dữ liệu */}
      {!loading && logs.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = category === f.key;
              const count = summary[f.countKey];
              return (
                <button
                  key={f.key}
                  onClick={() => setCategory(f.key)}
                  aria-pressed={active}
                  className={[
                    "text-[13px] font-semibold px-3 py-1.5 rounded-full border transition-colors",
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700",
                  ].join(" ")}
                >
                  {f.label}
                  <span className={["ml-1.5 tabular-nums", active ? "text-blue-100" : "text-slate-400 dark:text-slate-500"].join(" ")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên trạm…"
              aria-label="Tìm theo tên trạm"
              className="w-full min-h-[44px] pl-11 pr-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      )}

      {/* Báo khi lọc ra rỗng nhưng ngày vẫn có dữ liệu */}
      {!loading && logs.length > 0 && filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
          Không có lượt nào khớp bộ lọc.
        </div>
      ) : (
        <ScanHistory logs={filtered} loading={loading} error={error} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatPill — ô thống kê nhỏ (nhãn + số), màu theo tone
// ---------------------------------------------------------------------------
const TONE = {
  slate:   "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200",
  emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  red:     "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300",
  amber:   "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function StatPill({ label, value, tone }) {
  return (
    <div className={["rounded-xl px-2 py-2 flex flex-col items-center justify-center text-center", TONE[tone]].join(" ")}>
      <span className="text-[18px] font-extrabold tabular-nums leading-none">{value}</span>
      <span className="text-[11px] font-medium mt-1 leading-tight">{label}</span>
    </div>
  );
}
