import { formatDateTime } from "../lib/utils";

export default function ScanHistory({ logs, loading, error }) {
  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        <div className="flex justify-center mb-3">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        Đang tải...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-500 dark:text-red-400">{error}</div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        Chưa có lượt check-in nào hôm nay.
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {logs.map((log) => (
        <li
          key={log.id}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3.5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-base text-slate-800 dark:text-slate-100">
                {log.location}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {formatDateTime(log.scanned_at)}
              </p>
              {log.geo_status === "ok" && log.geo_distance != null && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-0.5">
                  📍 Đúng trạm ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "out_of_range" && log.geo_distance != null && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-0.5 font-medium">
                  🚨 Ngoài phạm vi ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "no_gps" && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">⚠️ Không có GPS</p>
              )}
            </div>
            <span
              className={`text-sm px-3 py-1 rounded-full font-medium flex-shrink-0 ${
                log.email_sent
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
              }`}
            >
              {log.email_sent ? "Email ✓" : "Email ✗"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
