import { useState, useEffect, useCallback } from "react";
import { Settings, MapPin, Link2, SlidersHorizontal, ListChecks, BarChart3, Download, CheckCircle2, XCircle } from "lucide-react";
import { buildStationsRows, buildAliasesRows, exportToExcel } from "../lib/exportExcel";
import { getAdminStationParams } from "../lib/api";
import { api, SESSION_KEY } from "../components/admin/adminApi";
import LoginGate from "../components/admin/LoginGate";
import PurgeButton from "../components/admin/PurgeButton";
import StationsPanel from "../components/admin/StationsPanel";
import AliasesPanel from "../components/admin/AliasesPanel";
import StationParamsPanel from "../components/admin/StationParamsPanel";
import ChecklistStationsPanel from "../components/admin/ChecklistStationsPanel";
import DashboardPage from "./DashboardPage";

/**
 * AdminPage — gate đăng nhập + dashboard 3 tab.
 * Các panel được tách ra components/admin/ (file này từng dài 800+ dòng).
 */
export default function AdminPage() {
  const savedKey = sessionStorage.getItem(SESSION_KEY) || "";
  const [adminKey, setAdminKey] = useState(savedKey);

  if (!adminKey) return <LoginGate onLogin={setAdminKey} />;
  return <AdminDashboard adminKey={adminKey} onLogout={() => { sessionStorage.removeItem(SESSION_KEY); setAdminKey(""); }} />;
}

const TAB_BTN_BASE = "px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px]";
const TAB_BTN_ACTIVE = "bg-blue-600 text-white";
const TAB_BTN_IDLE = "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700";

function AdminDashboard({ adminKey, onLogout }) {
  const [stations,      setStations]      = useState([]);
  const [aliases,       setAliases]       = useState([]);
  const [stationParams, setStationParams] = useState([]);
  const [tab,           setTab]           = useState("stations");
  const [msg,           setMsg]           = useState(null); // { ok, text }

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
  }, [adminKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-2">
        <h1 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 flex-shrink-0" aria-hidden />
          Admin — Quản lý Checkpoint
        </h1>
        <div className="flex items-center gap-3">
          <PurgeButton adminKey={adminKey} flash={flash} />
          <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400">
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-2 ${
          msg.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {msg.ok
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Tabs + Export */}
      <div className="flex items-center justify-between gap-2 mx-4 mt-4 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setTab("stations")} className={`${TAB_BTN_BASE} ${tab === "stations" ? TAB_BTN_ACTIVE : TAB_BTN_IDLE}`}>
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden />Trạm ({stations.length})</span>
          </button>
          <button onClick={() => setTab("aliases")} className={`${TAB_BTN_BASE} ${tab === "aliases" ? TAB_BTN_ACTIVE : TAB_BTN_IDLE}`}>
            <span className="flex items-center gap-1.5"><Link2 className="w-4 h-4" aria-hidden />QR Alias ({aliases.length})</span>
          </button>
          <button onClick={() => setTab("params")} className={`${TAB_BTN_BASE} ${tab === "params" ? TAB_BTN_ACTIVE : TAB_BTN_IDLE}`}>
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" aria-hidden />Thông số ({stationParams.length})</span>
          </button>
          <button onClick={() => setTab("checklists")} className={`${TAB_BTN_BASE} ${tab === "checklists" ? TAB_BTN_ACTIVE : TAB_BTN_IDLE}`}>
            <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4" aria-hidden />Checklist ↔ Trạm</span>
          </button>
          <button onClick={() => setTab("dashboard")} className={`${TAB_BTN_BASE} ${tab === "dashboard" ? TAB_BTN_ACTIVE : TAB_BTN_IDLE}`}>
            <span className="flex items-center gap-1.5"><BarChart3 className="w-4 h-4" aria-hidden />Thống kê</span>
          </button>
        </div>
        {tab !== "params" && tab !== "dashboard" && tab !== "checklists" && (
          <button
            onClick={() => {
              if (tab === "stations") exportToExcel(buildStationsRows(stations), "tram-checkpoint.xlsx", "Trạm");
              else exportToExcel(buildAliasesRows(aliases), "qr-alias.xlsx", "QR Alias");
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold active:bg-green-700 transition-colors min-h-[44px]"
          >
            <Download className="w-4 h-4" aria-hidden />
            Xuất Excel
          </button>
        )}
      </div>

      <div className="mx-4 mt-4 space-y-4">
        {tab === "stations"  && <StationsPanel stations={stations} client={client} onRefresh={loadAll} flash={flash} />}
        {tab === "aliases"   && <AliasesPanel aliases={aliases} stations={stations} client={client} onRefresh={loadAll} flash={flash} />}
        {tab === "params"    && <StationParamsPanel stationParams={stationParams} stations={stations} adminKey={adminKey} onRefresh={loadAll} flash={flash} />}
        {tab === "checklists" && <ChecklistStationsPanel stations={stations} flash={flash} />}
        {tab === "dashboard" && <DashboardPage />}
      </div>
    </div>
  );
}
