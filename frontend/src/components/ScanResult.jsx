import { formatDateTime } from "../lib/utils";

export default function ScanResult({ result, onDismiss }) {
  if (!result) return null;

  const isOk = result.status === "ok";
  const isOffline = result.status === "offline";
  const isOutOfRange = result.outOfRange;

  const cardStyle = isOk
    ? "bg-green-50 border-green-200 text-green-900"
    : isOffline
    ? "bg-blue-50 border-blue-200 text-blue-900"
    : isOutOfRange
    ? "bg-orange-50 border-orange-200 text-orange-900"
    : "bg-red-50 border-red-200 text-red-900";

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cardStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-lg">
          {isOk ? "✅" : isOffline ? "💾" : isOutOfRange ? "📍" : "❌"} {result.message}
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 text-xl leading-none flex-shrink-0"
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
          {isOk && (
            result.scan_id
              ? <p className="text-xs text-green-700 font-bold">✅ Đã lưu DB — ID: #{result.scan_id}</p>
              : <p className="text-xs text-yellow-700 font-bold">⚠️ Ghi nhận nhưng không có xác nhận ID</p>
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
