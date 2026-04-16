import { formatDateTime } from "../lib/utils";

export default function ScanResult({ result, onDismiss }) {
  if (!result) return null;

  const isOk = result.status === "ok";
  const isOutOfRange = result.outOfRange;

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-3 ${
        isOk
          ? "bg-green-50 border-green-200 text-green-900"
          : isOutOfRange
          ? "bg-orange-50 border-orange-200 text-orange-900"
          : "bg-red-50 border-red-200 text-red-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-lg">
          {isOk ? "✅" : isOutOfRange ? "📍" : "❌"} {result.message}
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 text-xl leading-none flex-shrink-0"
          aria-label="Đóng"
        >
          ×
        </button>
      </div>

      {isOk && (
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
          {result.scan_id
            ? <p className="text-xs text-green-700 font-bold">✅ Đã lưu DB — ID: #{result.scan_id}</p>
            : <p className="text-xs text-red-600 font-bold">⚠️ Không có scan_id — chưa lưu DB!</p>
          }
        </div>
      )}

      {/* Debug: luôn hiển thị message gốc từ server */}
      <p className="text-xs opacity-60 break-all">
        Server: {result.message || "(không có message)"}
      </p>

      {isOutOfRange && result.distance && (
        <p className="text-base font-medium">
          Khoảng cách hiện tại: <span className="font-bold">{result.distance}m</span>
        </p>
      )}
    </div>
  );
}
