import { useState } from "react";
import { Pencil, Trash2, Plus, LocateFixed } from "lucide-react";
import { INPUT_CLS, ROW_BTN_CLS, ROW_BTN_DANGER_CLS } from "./adminApi";
import { buildStationUpdatePayload } from "../../lib/stationForm";

export default function StationsPanel({ stations, client, onRefresh, flash }) {
  const empty = { name: "", lat: "", lng: "", radius: "300", qr_content: "" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null); // station name đang sửa
  const [saving, setSaving] = useState(false);

  const useGPS = () => {
    if (!navigator.geolocation) return flash(false, "Thiết bị không hỗ trợ GPS");
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
      () => flash(false, "Không lấy được vị trí GPS"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = buildStationUpdatePayload(form, editing);
        await client.put(`/api/admin/stations/${editing}`, payload);
        flash(true, payload.name
          ? `Đã đổi tên ${editing} → ${payload.name}`
          : `Đã cập nhật trạm ${editing}`);
      } else {
        await client.post("/api/admin/stations", form);
        flash(true, `Đã thêm trạm ${form.name}`);
      }
      setForm(empty);
      setEditing(null);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (st) => {
    setEditing(st.name);
    setForm({ name: st.name, lat: st.lat, lng: st.lng, radius: st.radius });
  };

  const handleDelete = async (name) => {
    if (!confirm(`Vô hiệu hoá trạm "${name}"?`)) return;
    try {
      await client.delete(`/api/admin/stations/${name}`);
      flash(true, `Đã vô hiệu hoá ${name}`);
      onRefresh();
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Form */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          {editing
            ? <><Pencil className="w-4 h-4" aria-hidden />Sửa trạm {editing}</>
            : <><Plus className="w-4 h-4" aria-hidden />Thêm trạm mới</>}
        </h2>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Tên trạm *</label>
          <input
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
            placeholder="VD: PUMP_STATION_7"
            required
            className={INPUT_CLS}
          />
          {editing && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Đổi tên sẽ cập nhật cả thông số, alias và lịch sử scan. QR cũ in tên cũ vẫn quét được.
            </p>
          )}
        </div>
        {!editing && (
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Nội dung QR code tại trạm (nếu khác tên trạm)</label>
            <input
              value={form.qr_content} onChange={e => setForm(f => ({ ...f, qr_content: e.target.value }))}
              placeholder="VD: 052-PG-071"
              className={INPUT_CLS}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Điền để hệ thống tự nhận diện QR → trạm. Bỏ trống nếu QR đã ghi đúng tên trạm.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Latitude *</label>
            <input
              value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="15.408751" type="number" step="any" required
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Longitude *</label>
            <input
              value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="108.814616" type="number" step="any" required
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Bán kính (mét)</label>
            <input
              value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
              type="number" min="10" max="5000"
              className={INPUT_CLS}
            />
          </div>
          <button type="button" onClick={useGPS}
            className="py-2.5 px-3 rounded-xl border border-blue-300 text-blue-700 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-1.5">
            <LocateFixed className="w-4 h-4" aria-hidden />
            Lấy GPS hiện tại
          </button>
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm trạm"}
          </button>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }}
              className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold">
              Huỷ
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="space-y-2">
        {stations.length === 0 && (
          <p className="text-center text-slate-400 py-4 text-sm">Chưa có trạm nào trong DB — đang dùng file config mặc định</p>
        )}
        {stations.map(st => (
          <div key={st.name} className={`bg-white dark:bg-slate-800 rounded-xl border px-4 py-3 flex items-center justify-between gap-2 ${
            st.active ? "border-slate-200 dark:border-slate-700" : "border-slate-100 dark:border-slate-800 opacity-50"
          }`}>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{st.name}</p>
              <p className="text-xs text-slate-400">{st.lat}, {st.lng} · r={st.radius}m</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(st)} title="Sửa" className={ROW_BTN_CLS}>
                <Pencil className="w-4 h-4" aria-hidden />
              </button>
              <button onClick={() => handleDelete(st.name)} title="Vô hiệu hoá" className={ROW_BTN_DANGER_CLS}>
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
