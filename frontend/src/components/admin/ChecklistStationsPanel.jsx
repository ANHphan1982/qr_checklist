// ChecklistStationsPanel — gán trạm đã cấu hình vào từng checklist (tick chọn).
// Mapping lưu localStorage qua lib/checklistStations (không đụng backend / logic scan).
//
// UX: chọn 1 checklist ở trên → tick các trạm thuộc checklist đó ở dưới.
// Tối ưu mobile: hàng cao ≥44px, cả hàng là hit-target, có ô tìm trạm.

import { useMemo, useState } from "react";
import { ListChecks, Search, Check } from "lucide-react";
import { CHECKLISTS } from "../../pages/HomePage";
import {
  loadAssignments,
  saveAssignments,
  getStationsFor,
  isAssigned,
  toggleStation,
} from "../../lib/checklistStations";

export default function ChecklistStationsPanel({ stations, flash }) {
  const [assignments, setAssignments] = useState(() => loadAssignments());
  const [selected, setSelected] = useState(CHECKLISTS[0]?.id || "");
  const [query, setQuery] = useState("");

  const activeStations = useMemo(
    () => (stations || []).filter((s) => s.active !== false),
    [stations]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return activeStations;
    return activeStations.filter((s) => s.name.toUpperCase().includes(q));
  }, [activeStations, query]);

  const toggle = (stationName) => {
    const next = toggleStation(assignments, selected, stationName);
    setAssignments(next);
    saveAssignments(next);
    const on = isAssigned(next, selected, stationName);
    const title = CHECKLISTS.find((c) => c.id === selected)?.title || selected;
    flash(true, on ? `Đã gán ${stationName} → ${title}` : `Đã gỡ ${stationName} khỏi ${title}`);
  };

  return (
    <div className="space-y-4">
      {/* Chọn checklist */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <ListChecks className="w-4 h-4" aria-hidden />
          Gán trạm vào checklist
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          {CHECKLISTS.map((c) => {
            const count = getStationsFor(assignments, c.id).length;
            const on = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`px-3 py-2 rounded-xl text-sm font-semibold min-h-[44px] border transition-colors ${
                  on
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {c.title}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs font-bold ${on ? "text-blue-100" : "text-blue-600 dark:text-blue-400"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tìm trạm */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm trạm…"
          aria-label="Tìm trạm"
          className="w-full min-h-[48px] pl-12 pr-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Danh sách trạm — tick chọn */}
      <div className="space-y-2">
        {activeStations.length === 0 && (
          <p className="text-center text-slate-400 py-6 text-sm">
            Chưa có trạm nào — thêm trạm ở tab "Trạm" trước.
          </p>
        )}
        {activeStations.length > 0 && filtered.length === 0 && (
          <p className="text-center text-slate-400 py-6 text-sm">Không tìm thấy trạm khớp.</p>
        )}
        {filtered.map((st) => {
          const checked = isAssigned(assignments, selected, st.name);
          return (
            <label
              key={st.name}
              className={`flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border px-4 py-3 min-h-[52px] cursor-pointer transition-colors ${
                checked ? "border-blue-400 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-500/10" : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(st.name)}
                className="sr-only"
              />
              <span
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border-2 ${
                  checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-600"
                }`}
                aria-hidden
              >
                {checked && <Check className="w-4 h-4" strokeWidth={3} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-800 dark:text-slate-100 truncate">{st.name}</span>
                {(st.lat != null && st.lng != null) && (
                  <span className="block text-xs text-slate-400">{st.lat}, {st.lng}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
