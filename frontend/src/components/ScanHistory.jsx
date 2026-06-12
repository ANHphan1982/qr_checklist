import { formatDateTime } from "../lib/utils";
import { isOutOfRange } from "../lib/exportExcel";
import { MapPin, AlertTriangle, MapPinOff, MailCheck, MailX } from "lucide-react";

// Skeleton card — giữ đúng hình khối card thật để không giật layout khi load xong
function SkeletonCard() {
  return (
    <li className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3.5 shadow-sm animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/5 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-3/5 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-700/60" />
        </div>
        <div className="h-7 w-20 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
      </div>
    </li>
  );
}

export default function ScanHistory({ logs, loading, error }) {
  if (loading) {
    return (
      <ul className="space-y-2.5" aria-label="Đang tải dữ liệu">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </ul>
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
                <p className="text-sm text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  Đúng trạm ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "out_of_range" && log.geo_distance != null && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-0.5 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  Ngoài phạm vi ({log.geo_distance}m)
                </p>
              )}
              {log.geo_status === "cached" && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  Vị trí lưu tạm{log.geo_distance != null ? ` (${log.geo_distance}m)` : ""}
                </p>
              )}
              {log.geo_status === "unverified" && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  GPS có nhưng trạm chưa cấu hình tọa độ — chưa xác thực vị trí
                </p>
              )}
              {log.geo_status === "no_gps" && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPinOff className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                  Không có GPS
                </p>
              )}

              {Array.isArray(log.param_values) && log.param_values.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {log.param_values.map((pv, i) => {
                    const out = isOutOfRange(pv.value ?? null, pv.low ?? null, pv.high ?? null);
                    return (
                      <p
                        key={i}
                        className={`text-sm ${out ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-600 dark:text-slate-300"}`}
                      >
                        {pv.tag && <span className="font-mono text-xs mr-1">{pv.tag}</span>}
                        {pv.label}: <span className="font-semibold">{pv.value ?? "—"}</span>
                        {pv.unit ? ` ${pv.unit}` : ""}
                        {out && <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1 align-text-top" aria-hidden />}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
            <span
              className={`text-sm px-3 py-1 rounded-full font-medium flex-shrink-0 flex items-center gap-1 ${
                log.email_sent
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
              }`}
            >
              {log.email_sent
                ? <MailCheck className="w-3.5 h-3.5" aria-hidden />
                : <MailX className="w-3.5 h-3.5" aria-hidden />}
              Email
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
