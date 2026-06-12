import { formatDateTime } from "../lib/utils";
import { CheckCircle2, XCircle, CloudOff, MapPinOff, X, AlertTriangle } from "lucide-react";

export default function ScanResult({ result, onDismiss }) {
  if (!result) return null;

  const isOk        = result.status === "ok";
  const isOffline   = result.status === "offline";
  const isOutOfRange = result.outOfRange;

  const cardStyle = isOk
    ? "bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
    : isOffline
    ? "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300"
    : isOutOfRange
    ? "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300"
    : "bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300";

  const StatusIcon = isOk ? CheckCircle2 : isOffline ? CloudOff : isOutOfRange ? MapPinOff : XCircle;

  return (
    <div
      data-testid="scan-result"
      data-status={isOk ? "ok" : isOffline ? "offline" : isOutOfRange ? "out_of_range" : "error"}
      className={`anim-card-in rounded-2xl border p-4 flex flex-col gap-3 ${cardStyle}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 font-semibold text-lg">
          <StatusIcon className={`anim-icon-pop mt-0.5 flex-shrink-0 ${isOk ? "w-8 h-8" : "w-6 h-6"}`} aria-hidden />
          <span className={isOk ? "mt-0.5" : ""}>{result.message}</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-current opacity-40 active:opacity-70 flex-shrink-0 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Đóng"
        >
          <X className="w-6 h-6" aria-hidden />
        </button>
      </div>

      {(isOk || isOffline) && (
        <div className="text-base space-y-1.5">
          {result.location && (
            <p>
              <span className="font-medium">Trạm:</span> {result.location}
            </p>
          )}
          {result.scanned_at && (
            <p>
              <span className="font-medium">Thời gian:</span>{" "}
              {formatDateTime(result.scanned_at)}
            </p>
          )}
          {isOk && result.email_sent === false && (
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
              Email chưa gửi được — kiểm tra cấu hình Resend
            </p>
          )}
        </div>
      )}

      {isOutOfRange && result.distance && (
        <p className="text-base font-medium">
          Khoảng cách hiện tại: <span className="font-bold">{result.distance}m</span>
        </p>
      )}
    </div>
  );
}
