// Toast — thông báo nổi thống nhất (thay các setTimeout/banner rải rác).
// Dùng: bọc app trong <ToastProvider>, gọi const toast = useToast(); toast.success("...").
//
// Accessible: container role="status" aria-live="polite". Tự ẩn sau `duration`.

import { createContext, useCallback, useContext, useReducer, useRef } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { toastReducer } from "../../lib/toastReducer";

const ToastContext = createContext(null);

const DEFAULT_DURATION = 3500;

const STYLE = {
  success: { cls: "bg-emerald-600 text-white", Icon: CheckCircle2 },
  error:   { cls: "bg-red-600 text-white",     Icon: AlertTriangle },
  info:    { cls: "bg-slate-800 text-white dark:bg-slate-700", Icon: Info },
};

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const idRef = useRef(0);

  const remove = useCallback((id) => dispatch({ type: "remove", id }), []);

  const push = useCallback((type, message, duration = DEFAULT_DURATION) => {
    if (!message) return;
    const id = ++idRef.current;
    dispatch({ type: "add", toast: { id, type, message } });
    if (duration > 0) {
      setTimeout(() => dispatch({ type: "remove", id }), duration);
    }
    return id;
  }, []);

  const api = useRef({
    success: (m, d) => push("success", m, d),
    error:   (m, d) => push("error", m, d),
    info:    (m, d) => push("info", m, d),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

/** Hook lấy API toast. Trả no-op nếu chưa bọc Provider (an toàn khi test). */
export function useToast() {
  return useContext(ToastContext) || NOOP;
}

const NOOP = { success: () => {}, error: () => {}, info: () => {} };

function ToastContainer({ toasts, onClose }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { cls, Icon } = STYLE[t.type] || STYLE.info;
        return (
          <div
            key={t.id}
            className={["anim-card-in pointer-events-auto w-full max-w-sm rounded-2xl shadow-lg px-4 py-3 flex items-center gap-2.5", cls].join(" ")}
          >
            <Icon className="w-5 h-5 flex-shrink-0" aria-hidden />
            <span className="flex-1 text-[14px] font-semibold leading-snug">{t.message}</span>
            <button
              onClick={() => onClose(t.id)}
              aria-label="Đóng thông báo"
              className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center opacity-70 active:opacity-100"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
