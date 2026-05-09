import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { buildStationsRows, buildAliasesRows, exportToExcel } from "../lib/exportExcel";
import {
  getAdminStationParams,
  createAdminStationParam,
  updateAdminStationParam,
  deleteAdminStationParam,
} from "../lib/api";

const BASE = import.meta.env.VITE_API_URL || "";
const SESSION_KEY = "admin_authed";

function api(adminKey) {
  return axios.create({
    baseURL: BASE,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// Login gate
// ---------------------------------------------------------------------------
function LoginGate({ onLogin }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await api(key).get("/api/admin/stations");
      sessionStorage.setItem(SESSION_KEY, key);
      onLogin(key);
    } catch {
      setErr("Sai mật khẩu admin hoặc server lỗi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">🔐 Admin QR Checklist</h1>
        <input
          type="password"
          placeholder="Nhập mật khẩu admin"
          value={key}
          onChange={e => setKey(e.target.value)}
          className="border rounded-xl px-4 py-3 text-base w-full dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          autoFocus
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={loading || !key}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50"
        >
          {loading ? "Đang kiểm tra..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Admin UI
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const savedKey = sessionStorage.getItem(SESSION_KEY) || "";
  const [adminKey, setAdminKey] = useState(savedKey);

  if (!adminKey) return <LoginGate onLogin={setAdminKey} />;
  return <AdminDashboard adminKey={adminKey} onLogout={() => { sessionStorage.removeItem(SESSION_KEY); setAdminKey(""); }} />;
}

function AdminDashboard({ adminKey, onLogout }) {
  const [stations,     setStations]     = useState([]);
  const [aliases,      setAliases]      = useState([]);
  const [stationParams, setStationParams] = useState([]);
  const [tab,          setTab]          = useState("stations");
  const [msg,          setMsg]          = useState(null); // { ok, text }

  const client = api(adminKey);

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [s, a, p] = await Promise.all([
        client.get("/api/admin/stations"),
        client.get("/api/admin/qr-aliases"),
        getAdminStationParams(adminKey),
      ]);
      setStations(s.data);
      setAliases(a.data);
      setStationParams(p);
    } catch (e) {
      flash(false, `Lỗi tải dữ liệu: ${e?.response?.data?.error || e.message}`);
    }
  }, [adminKey]);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg text-slate-800 dark:text-slate-100">⚙️ Admin — Quản lý Checkpoint</h1>
        <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400">
          Đăng xuất
        </button>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium ${
          msg.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {msg.ok ? "✅ " : "❌ "}{msg.text}
        </div>
      )}

      {/* Tabs + Export */}
      <div className="flex items-center justify-between gap-2 mx-4 mt-4 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setTab("stations")} className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${tab === "stations" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}>
            📍 Trạm ({stations.length})
          </button>
          <button onClick={() => setTab("aliases")} className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${tab === "aliases" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}>
            🔗 QR Alias ({aliases.length})
          </button>
          <button onClick={() => setTab("params")} className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${tab === "params" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}>
            ⚙️ Thông số ({stationParams.length})
          </button>
        </div>
        {tab !== "params" && (
          <button
            onClick={() => {
              if (tab === "stations") exportToExcel(buildStationsRows(stations), "tram-checkpoint.xlsx", "Trạm");
              else exportToExcel(buildAliasesRows(aliases), "qr-alias.xlsx", "QR Alias");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold active:bg-green-700 transition-colors min-h-[44px]"
          >
            📥 Xuất Excel
          </button>
        )}
      </div>

      <div className="mx-4 mt-4 space-y-4">
        {tab === "stations" && <StationsPanel stations={stations} client={client} onRefresh={loadAll} flash={flash} />}
        {tab === "aliases"  && <AliasesPanel aliases={aliases} stations={stations} client={client} onRefresh={loadAll} flash={flash} />}
        {tab === "params"   && <StationParamsPanel stationParams={stationParams} stations={stations} adminKey={adminKey} onRefresh={loadAll} flash={flash} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stations Panel
// ---------------------------------------------------------------------------
function StationsPanel({ stations, client, onRefresh, flash }) {
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
        await client.put(`/api/admin/stations/${editing}`, { lat: form.lat, lng: form.lng, radius: form.radius });
        flash(true, `Đã cập nhật trạm ${editing}`);
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
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">
          {editing ? `✏️ Sửa trạm ${editing}` : "➕ Thêm trạm mới"}
        </h2>

        {!editing && (
          <>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Tên trạm *</label>
              <input
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                placeholder="VD: PUMP_STATION_7"
                required
                className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Nội dung QR code tại trạm (nếu khác tên trạm)</label>
              <input
                value={form.qr_content} onChange={e => setForm(f => ({ ...f, qr_content: e.target.value }))}
                placeholder="VD: 052-PG-071"
                className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Điền để hệ thống tự nhận diện QR → trạm. Bỏ trống nếu QR đã ghi đúng tên trạm.
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Latitude *</label>
            <input
              value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="15.408751" type="number" step="any" required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Longitude *</label>
            <input
              value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="108.814616" type="number" step="any" required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Bán kính (mét)</label>
            <input
              value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
              type="number" min="10" max="5000"
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
          <button type="button" onClick={useGPS}
            className="py-2.5 px-3 rounded-xl border border-blue-300 text-blue-700 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            📍 Lấy GPS hiện tại
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
              <button onClick={() => handleEdit(st)} className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">
                ✏️
              </button>
              <button onClick={() => handleDelete(st.name)} className="text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Station Params Panel — cấu hình thông số vận hành
// ---------------------------------------------------------------------------
function StationParamsPanel({ stationParams, stations, adminKey, onRefresh, flash }) {
  const empty = { station_name: "", param_label: "Tank level", param_unit: "mm" };
  const [form,    setForm]    = useState(empty);
  const [editing, setEditing] = useState(null); // id đang sửa
  const [saving,  setSaving]  = useState(false);

  const stationOptions = stations.length > 0
    ? stations.map(s => s.name)
    : [...new Set(stationParams.map(p => p.station_name))];

  const existingNames = new Set(stationParams.map(p => p.station_name));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing != null) {
        await updateAdminStationParam(adminKey, editing, {
          param_label: form.param_label,
          param_unit:  form.param_unit,
        });
        flash(true, `Đã cập nhật cấu hình ${form.station_name}`);
      } else {
        await createAdminStationParam(adminKey, form);
        flash(true, `Đã thêm thông số cho ${form.station_name}`);
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

  const handleEdit = (p) => {
    setEditing(p.id);
    setForm({ station_name: p.station_name, param_label: p.param_label, param_unit: p.param_unit });
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

  return (
    <div className="space-y-4">
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">
          {editing != null ? "✏️ Sửa cấu hình thông số" : "➕ Thêm cấu hình thông số"}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sau khi scan QR tại trạm được cấu hình, hệ thống sẽ hiện popup yêu cầu nhập thông số vận hành.
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
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
              <option value="">-- Chọn trạm --</option>
              {stationOptions.filter(n => !existingNames.has(n)).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          ) : (
            <input
              value={form.station_name}
              onChange={e => setForm(f => ({ ...f, station_name: e.target.value.toUpperCase() }))}
              placeholder="VD: TK-5203A"
              required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Tên thông số *</label>
            <input
              value={form.param_label}
              onChange={e => setForm(f => ({ ...f, param_label: e.target.value }))}
              placeholder="VD: Tank level, Áp suất"
              required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Đơn vị *</label>
            <input
              value={form.param_unit}
              onChange={e => setForm(f => ({ ...f, param_unit: e.target.value }))}
              placeholder="VD: mm, kg/cm2/g, %"
              required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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

      <div className="space-y-2">
        {stationParams.length === 0 && (
          <p className="text-center text-slate-400 py-4 text-sm">Chưa có cấu hình thông số nào</p>
        )}
        {stationParams.map(p => (
          <div key={p.id} className={`bg-white dark:bg-slate-800 rounded-xl border px-4 py-3 flex items-center justify-between gap-2 ${
            p.active ? "border-slate-200 dark:border-slate-700" : "border-slate-100 dark:border-slate-800 opacity-50"
          }`}>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{p.station_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {p.param_label} · <span className="font-mono">{p.param_unit}</span>
                {!p.active && <span className="ml-2 text-orange-500">· Tắt</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleToggle(p)}
                title={p.active ? "Tắt" : "Bật"}
                className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">
                {p.active ? "🔕" : "🔔"}
              </button>
              <button onClick={() => handleEdit(p)}
                className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">
                ✏️
              </button>
              <button onClick={() => handleDelete(p)}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QR Aliases Panel
// ---------------------------------------------------------------------------
function AliasesPanel({ aliases, stations, client, onRefresh, flash }) {
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
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">➕ Thêm QR Alias mới</h2>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Nội dung QR code *</label>
          <input
            value={form.qr_content} onChange={e => setForm(f => ({ ...f, qr_content: e.target.value }))}
            placeholder="VD: 052-LI-066B"
            required
            className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Tên trạm (checkpoint) *</label>
          {stationOptions.length > 0 ? (
            <select
              value={form.station_name} onChange={e => setForm(f => ({ ...f, station_name: e.target.value }))}
              required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
              <option value="">-- Chọn trạm --</option>
              {stationOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input
              value={form.station_name} onChange={e => setForm(f => ({ ...f, station_name: e.target.value.toUpperCase() }))}
              placeholder="VD: TK-5205A"
              required
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400">Ghi chú (tuỳ chọn)</label>
          <input
            value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="VD: Level gauge at foot of Tank"
            className="mt-1 w-full border rounded-xl px-3 py-2.5 text-base dark:bg-slate-700 dark:border-slate-600 dark:text-white"
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
          <button onClick={() => handleDelete(a.id, a.qr_content)}
            className="flex-shrink-0 text-sm px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
}
