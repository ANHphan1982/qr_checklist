/**
 * uiClasses — class builder cho UI primitives.
 * Một nguồn duy nhất cho style button, thay vì lặp chuỗi Tailwind khắp nơi.
 */

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-xl " +
  "transition-colors disabled:opacity-60 select-none";

export const BUTTON_VARIANTS = {
  primary:   "bg-blue-600 text-white active:bg-blue-700",
  secondary: "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600",
  danger:    "bg-red-100 text-red-700 active:bg-red-200 dark:bg-red-900/30 dark:text-red-300",
  outline:   "border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700",
  success:   "bg-green-600 text-white active:bg-green-700",
};

export const BUTTON_SIZES = {
  sm: "min-h-[44px] px-4 py-2.5 text-sm",
  md: "min-h-[48px] px-5 py-3 text-base",
  xl: "min-h-[68px] px-6 py-5 text-xl font-bold rounded-2xl gap-3",
};

export function buttonClasses(variant = "primary", size = "md") {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  return `${BASE} ${s} ${v}`;
}
