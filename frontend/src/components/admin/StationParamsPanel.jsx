import { useState } from "react";
import { Plus, Pencil, Trash2, Bell, BellOff, Download, AlertTriangle } from "lucide-react";
import {
  createAdminStationParam,
  updateAdminStationParam,
  deleteAdminStationParam,
} from "../../lib/api";
import { PARAM_UNIT_OPTIONS } from "../../lib/paramUnits";
import { BUILTIN_PARAM_CONFIGS, builtinStationsNotInDb } from "../../lib/builtinConfigs";
import { INPUT_CLS, ROW_BTN_CLS, ROW_BTN_DANGER_CLS } from "./adminApi";

export default function StationParamsPanel({ stationParams, stations, adminKey, onRefresh, flash }) {
  const empty = { station_name: "", tag: "", param_label: "", param_unit: "mm", param_low: "", param_high: "", sort_order: "" };
  const [form,    setForm]    = useState(empty);
  const [editing, setEditing] = useState(null); // id đang sửa
  const [saving,  setSaving]  = useState(false);
  const [importing, setImporting] = useState(null); // station_name đang import builtin

  // Trạm có cấu hình builtin sẵn trong app nhưng CHƯA có bản ghi DB → chưa
  // bật/tắt được. Admin import xuống DB trước, rồi mới dùng nút chuông để ẩn.
  const builtinPending = builtinStationsNotInDb(BUILTIN_PARAM_CONFIGS, stationParams);

  const stationOptions = stations.length > 0
    ? stations.map(s => s.name)
    : [...new Set(stationParams.map(p => p.station_name))];

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const toFloatOrNull = v => v !== "" && v !== null ? parseFloat(v) : null;
      const toIntOrZero = v => v !== "" && v !== null && !Number.isNaN(parseInt(v, 10)) ? parseInt(v, 10) : 0;
      if (editing != null) {
        await updateAdminStationParam(adminKey, editing, {
          tag:         form.tag,
          param_label: form.param_label,
          param_unit:  form.param_unit,
          param_low:   toFloatOrNull(form.param_low),
          param_high:  toFloatOrNull(form.param_high),
          sort_order:  toIntOrZero(form.sort_order),
        });
        flash(true, `Đã cập nhật thông số ${form.tag || form.param_label}`);
      } else {
        await createAdminStationParam(adminKey, { ...form, sort_order: toIntOrZero(form.sort_order) });
        flash(true, `Đã thêm thông số cho ${form.station_name}`);
      }
      // Giữ lại station_name để nhập tiếp nhiều thông số cho cùng 1 trạm
      setForm({ ...empty, station_name: editing != null ? "" : form.station_name });
      setEditing(null);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p) => {
    setEditing(p.id);
    setForm({
      station_name: p.station_name,
      tag:          p.tag ?? "",
      param_label:  p.param_label,
      param_unit:   p.param_unit,
      param_low:    p.param_low  ?? "",
      param_high:   p.param_high ?? "",
      sort_order:   p.sort_order ?? "",
    });
  };

  const handleDelete = async (p) => {
    if (!confirm(`Xóa cấu hình thông số cho "${p.station_name}"?`)) return;
    try {
      await deleteAdminStationParam(adminKey, p.id);
      flash(true, `Đã xóa cấu hình ${p.station_name}`);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    }
  };

  const handleToggle = async (p) => {
    try {
      await updateAdminStationParam(adminKey, p.id, { active: !p.active });
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    }
  };

  // Import toàn bộ thông số builtin của một trạm xuống DB (đang bật). Sau đó admin
  // có thể bật/tắt từng dòng như thông số DB bình thường.
  const handleImportBuiltin = async (cfg) => {
    setImporting(cfg.station_name);
    try {
      let order = 0;
      for (const p of cfg.params) {
        await createAdminStationParam(adminKey, {
          station_name: cfg.station_name,
          tag:          p.tag || "",
          param_label:  p.param_label,
          param_unit:   p.param_unit,
          param_low:    p.param_low ?? null,
          param_high:   p.param_high ?? null,
          sort_order:   order++,
        });
      }
      flash(true, `Đã đưa ${cfg.station_name} vào DB — giờ có thể bật/tắt từng thông số`);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          {editing != null
            ? <><Pencil className="w-4 h-4" aria-hidden />Sửa cấu hình thông số</>
            : <><Plus className="w-4 h-4" aria-hidden />Thêm cấu hình thông số</>}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sau khi scan QR tại trạm được cấu hình, hệ thống sẽ hiện popup yêu cầu nhập thông số vận hành.
          Một trạm có thể có <strong>nhiều thông số</strong> — thêm từng dòng, cùng chọn một trạm.
          Bấm <strong>nút chuông</strong> để <strong>ẩn</strong> một thông số (không cần ghi / thiết bị lỗi) —
          khi ẩn hết, trạm sẽ không hiện popup lúc scan.
        </p>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Trạm *</label>
          {editing != null ? (
            <p className="mt-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-base font-semibold">
              {form.station_name}
            </p>
          ) : stationOptions.length > 0 ? (
            <select
              value={form.station_name}
              onChange={e => setForm(f => ({ ...f, station_name: e.target.value }))}
              required
              className={INPUT_CLS}
            >
              <option value="">-- Chọn trạm --</option>
              {stationOptions.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          ) : (
            <input
              value={form.station_name}
              onChange={e => setForm(f => ({ ...f, station_name: e.target.value.toUpperCase() }))}
              placeholder="VD: TK-5203A"
              required
              className={INPUT_CLS}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Mã thiết bị (tag)</label>
            <input
              value={form.tag}
              onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
              placeholder="VD: 052-PG-038"
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Thứ tự hiển thị</label>
            <input
              type="number"
              step="1"
              value={form.sort_order}
              onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              placeholder="0"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Tên thông số *</label>
            <input
              value={form.param_label}
              onChange={e => setForm(f => ({ ...f, param_label: e.target.value }))}
              placeholder="VD: Discharge pressure"
              required
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Đơn vị *</label>
            <select
              value={form.param_unit}
              onChange={e => setForm(f => ({ ...f, param_unit: e.target.value }))}
              required
              className={INPUT_CLS}
            >
              <option value="">-- Chọn đơn vị --</option>
              {PARAM_UNIT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Giới hạn dưới L</label>
            <input
              type="number"
              step="any"
              value={form.param_low}
              onChange={e => setForm(f => ({ ...f, param_low: e.target.value }))}
              placeholder="Không giới hạn"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Giới hạn trên H</label>
            <input
              type="number"
              step="any"
              value={form.param_high}
              onChange={e => setForm(f => ({ ...f, param_high: e.target.value }))}
              placeholder="Không giới hạn"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu..." : editing != null ? "Cập nhật" : "Thêm"}
          </button>
          {editing != null && (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }}
              className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold">
              Huỷ
            </button>
          )}
        </div>
      </form>

      {/* Trạm builtin (cấu hình sẵn trong app) chưa có bản ghi DB → cần import mới ẩn được */}
      {builtinPending.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 p-4 space-y-2">
          <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            <span>
              Các trạm dưới đây đang dùng <strong>cấu hình mặc định (builtin)</strong> nên chưa bật/tắt được.
              Bấm <strong>“Đưa vào DB”</strong> để quản lý — sau đó dùng nút chuông để ẩn thông số không cần ghi.
            </span>
          </p>
          {builtinPending.map(cfg => (
            <div key={cfg.station_name} className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {cfg.station_name}
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">· mặc định</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {cfg.params.map(p => p.param_label).join(", ")}
                </p>
              </div>
              <button
                onClick={() => handleImportBuiltin(cfg)}
                disabled={importing === cfg.station_name}
                className="flex-shrink-0 text-sm px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" aria-hidden />
                {importing === cfg.station_name ? "Đang đưa…" : "Đưa vào DB"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {stationParams.length === 0 && builtinPending.length === 0 && (
          <p className="text-center text-slate-400 py-4 text-sm">Chưa có cấu hình thông số nào</p>
        )}
        {[...stationParams]
          .sort((a, b) =>
            a.station_name.localeCompare(b.station_name) ||
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            (a.id ?? 0) - (b.id ?? 0)
          )
          .map(p => (
          <div key={p.id} className={`bg-white dark:bg-slate-800 rounded-xl border px-4 py-3 flex items-center justify-between gap-2 ${
            p.active ? "border-slate-200 dark:border-slate-700" : "border-slate-100 dark:border-slate-800 opacity-50"
          }`}>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {p.station_name}
                {p.tag && <span className="ml-2 font-mono text-xs text-blue-600 dark:text-blue-400">{p.tag}</span>}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {p.param_label} · <span className="font-mono">{p.param_unit}</span>
                {(p.param_low != null || p.param_high != null) && (
                  <span className="ml-2 font-mono">
                    · L:{p.param_low ?? "—"} / H:{p.param_high ?? "—"}
                  </span>
                )}
                {!p.active && <span className="ml-2 text-orange-500">· Tắt</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleToggle(p)}
                title={p.active ? "Tắt" : "Bật"}
                className={ROW_BTN_CLS}>
                {p.active
                  ? <BellOff className="w-4 h-4" aria-hidden />
                  : <Bell className="w-4 h-4" aria-hidden />}
              </button>
              <button onClick={() => handleEdit(p)} title="Sửa" className={ROW_BTN_CLS}>
                <Pencil className="w-4 h-4" aria-hidden />
              </button>
              <button onClick={() => handleDelete(p)} title="Xóa" className={ROW_BTN_DANGER_CLS}>
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
