import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INPUT_CLS, ROW_BTN_DANGER_CLS } from "./adminApi";

export default function AliasesPanel({ aliases, stations, client, onRefresh, flash }) {
  const empty = { qr_content: "", station_name: "", note: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/api/admin/qr-aliases", form);
      flash(true, `Đã thêm alias: ${form.qr_content} → ${form.station_name}`);
      setForm(empty);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, qr) => {
    if (!confirm(`Xóa alias "${qr}"?`)) return;
    try {
      await client.delete(`/api/admin/qr-aliases/${id}`);
      flash(true, `Đã xóa alias ${qr}`);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    }
  };

  // Gợi ý danh sách trạm: DB + static fallback names từ danh sách alias hiện có
  const stationOptions = stations.length > 0
    ? stations.map(s => s.name)
    : [...new Set(aliases.map(a => a.station_name))];

  return (
    <div className="space-y-4">
      {/* Form */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Plus className="w-4 h-4" aria-hidden />
          Thêm QR Alias mới
        </h2>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Nội dung QR code *</label>
          <input
            value={form.qr_content} onChange={e => setForm(f => ({ ...f, qr_content: e.target.value }))}
            placeholder="VD: 052-LI-066B"
            required
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Tên trạm (checkpoint) *</label>
          {stationOptions.length > 0 ? (
            <select
              value={form.station_name} onChange={e => setForm(f => ({ ...f, station_name: e.target.value }))}
              required
              className={INPUT_CLS}
            >
              <option value="">-- Chọn trạm --</option>
              {stationOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input
              value={form.station_name} onChange={e => setForm(f => ({ ...f, station_name: e.target.value.toUpperCase() }))}
              placeholder="VD: TK-5205A"
              required
              className={INPUT_CLS}
            />
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Ghi chú (tuỳ chọn)</label>
          <input
            value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="VD: Level gauge at foot of Tank"
            className={INPUT_CLS}
          />
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu..." : "Thêm Alias"}
        </button>
      </form>

      {/* List grouped by station */}
      {aliases.length === 0 && (
        <p className="text-center text-slate-400 py-4 text-sm">Chưa có alias nào trong DB — đang dùng file config mặc định</p>
      )}
      {aliases.map(a => (
        <div key={a.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{a.qr_content}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">→ <span className="font-semibold text-blue-600 dark:text-blue-400">{a.station_name}</span>
              {a.note && <span className="ml-1 text-slate-400">· {a.note}</span>}
            </p>
          </div>
          <button onClick={() => handleDelete(a.id, a.qr_content)} title="Xóa alias"
            className={`flex-shrink-0 ${ROW_BTN_DANGER_CLS}`}>
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
