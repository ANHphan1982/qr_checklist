import { formatDateTime } from "../lib/utils";

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

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${cardStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-lg">
          {isOk ? "✅" : isOffline ? "💾" : isOutOfRange ? "📍" : "❌"} {result.message}
        </div>
        <button
          onClick={onDismiss}
          className="text-current opacity-40 hover:opacity-70 text-2xl leading-none flex-shrink-0 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Đóng"
        >
          ×
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
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-1">
              ⚠️ Email chưa gửi được — kiểm tra cấu hình Resend
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
