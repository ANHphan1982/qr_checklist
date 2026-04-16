import { useEffect, useState } from "react";
import ScanHistory from "../components/ScanHistory";
import { getReports } from "../lib/api";

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function HistoryPage() {
  const [date, setDate] = useState(todayVN());
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Lịch sử Check-in</h1>
        {!loading && (
          <span className="text-sm text-slate-500">
            {total} lượt
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600" htmlFor="date-picker">
          Ngày:
        </label>
        <input
          id="date-picker"
          type="date"
          value={date}
          max={todayVN()}
          onChange={(e) => setDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => fetchLogs(date)}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium"
        >
          Tải
        </button>
      </div>

      <ScanHistory logs={logs} loading={loading} error={error} />
    </div>
  );
}
