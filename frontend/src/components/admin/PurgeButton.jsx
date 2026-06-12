import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "./adminApi";

/** Xóa scan_logs cũ để giải phóng dung lượng (Supabase free tier 500MB). */
export default function PurgeButton({ adminKey, flash }) {
  const [loading, setLoading] = useState(false);

  const handlePurge = async () => {
    const input = window.prompt(
      "Xóa scan logs cũ hơn bao nhiêu ngày?\n(Nhập số, tối thiểu 1 — mặc định 7)",
      "7"
    );
    if (input === null) return; // user bấm Cancel
    const days = parseInt(input, 10);
    if (!days || days < 1) {
      flash(false, "Số ngày không hợp lệ (phải >= 1)");
      return;
    }
    if (!window.confirm(`Xóa tất cả scan logs cũ hơn ${days} ngày?\nHành động này không thể hoàn tác.`)) return;

    setLoading(true);
    try {
      const { data } = await api(adminKey).post("/api/admin/purge", { older_than_days: days });
      flash(true, `Đã xóa ${data.deleted} bản ghi cũ hơn ${days} ngày`);
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePurge}
      disabled={loading}
      title="Xóa scan logs cũ để giải phóng dung lượng"
      className="text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium disabled:opacity-50 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center gap-1.5"
    >
      <Trash2 className="w-3.5 h-3.5" aria-hidden />
      {loading ? "Đang xóa..." : "Dọn dẹp DB"}
    </button>
  );
}
