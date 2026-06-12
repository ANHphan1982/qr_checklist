import { AlertTriangle, WifiOff, XCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Banner primitive — khối thông báo có màu + icon theo variant.
 * Variant khớp với resolveStatusBanner (lib/statusBanner.js).
 */
const STYLES = {
  warning:           "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300",
  warning_secondary: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300",
  error:             "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300",
  success:           "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300",
  info:              "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300",
  muted:             "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400",
  amber:             "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300",
};

const ICONS = {
  warning:           AlertTriangle,
  warning_secondary: WifiOff,
  error:             XCircle,
  success:           CheckCircle2,
  info:              Info,
  muted:             Info,
  amber:             AlertTriangle,
};

/**
 * @param {object} props
 * @param {keyof STYLES} props.variant
 * @param {import("react").ComponentType} [props.icon] - override icon mặc định của variant
 */
export default function Banner({ variant = "muted", icon, className = "", children }) {
  const style = STYLES[variant] || STYLES.muted;
  const Icon = icon || ICONS[variant] || Info;
  return (
    <div className={`rounded-xl border px-4 py-3 text-base ${style} ${className}`}>
      <div className="flex items-start gap-2">
        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
