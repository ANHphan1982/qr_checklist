/**
 * ConfirmDialog — thay window.confirm để đồng nhất UI (style, dark mode, font).
 * Dùng cho các hành động phá hủy (xóa queue) — nút confirm variant danger màu đỏ.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 shadow-xl p-6 flex flex-col gap-3 anim-card-in">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">
          {title}
        </h2>
        <p className="text-base text-slate-600 dark:text-slate-300">{message}</p>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-base active:bg-slate-100 dark:active:bg-slate-600 transition-colors min-h-[48px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl font-bold text-base transition-colors min-h-[48px] text-white ${
              danger ? "bg-red-600 active:bg-red-700" : "bg-blue-600 active:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
