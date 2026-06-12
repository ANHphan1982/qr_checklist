import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";

export const SESSION_KEY = "admin_authed";

/** Axios client gắn sẵn X-Admin-Key cho các endpoint /api/admin/*. */
export function api(adminKey) {
  return axios.create({
    baseURL: BASE,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    timeout: 15000,
  });
}

/** Class dùng chung cho input trong các form admin. */
export const INPUT_CLS =
  "mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white";

/** Class cho nút hành động nhỏ trong list row (sửa/xóa/bật-tắt). */
export const ROW_BTN_CLS =
  "text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium";

export const ROW_BTN_DANGER_CLS =
  "text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium";
