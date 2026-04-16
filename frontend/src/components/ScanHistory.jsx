import { formatDateTime } from "../lib/utils";

export default function ScanHistory({ logs, loading, error }) {
  if (loading) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">Đang tải...</div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-500 text-sm">{error}</div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        Chưa có lượt check-in nào hôm nay.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-base text-slate-800">{log.location}</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {formatDateTime(log.scanned_at)}
              </p>
              {log.geo_status === "ok" && log.geo_distance != null && (
                <p className="text-sm text-green-600 mt-0.5">
                  📍 Đúng trạm ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "out_of_range" && log.geo_distance != null && (
                <p className="text-sm text-red-600 mt-0.5 font-medium">
                  🚨 Ngoài phạm vi ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "no_gps" && (
                <p className="text-sm text-slate-400 mt-0.5">⚠️ Không có GPS</p>
              )}
            </div>
            <span
              className={`text-sm px-3 py-1 rounded-full font-medium flex-shrink-0 ${
                log.email_sent
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
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
