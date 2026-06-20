// HomePage.jsx — màn hình chọn loại checklist trước khi scan
// Mỗi checklist là 1 thẻ lớn (hit-target toàn thẻ ≥ 96px), bấm vào sẽ
// route tới /scan/:type để bắt đầu quét đúng bộ checklist tương ứng.
//
// Tối ưu Android: card bo 20px, icon 56px, label rõ, progress bar,
// search lọc nhanh, "Gần đây" để chọn lại checklist hay dùng.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHECKLIST_ART } from "../components/ChecklistArt";

// ---------------------------------------------------------------------------
// Icons (UI nhỏ — search / chevron). Hình minh họa thiết bị nằm ở ChecklistArt.
// ---------------------------------------------------------------------------
function SearchIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function ChevronRight({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
// ---------------------------------------------------------------------------
// Định nghĩa các checklist — thay bằng nguồn dữ liệu thật của bạn.
// `art` = id hình minh họa trong CHECKLIST_ART; `tint` = nền ô hình.
// ---------------------------------------------------------------------------
const CHECKLISTS = [
  { id: "pump",    title: "Pump Check List",       desc: "Kiểm tra bơm & động cơ",     stations: 6, items: 24, art: "pump",    tint: "bg-blue-100 dark:bg-blue-500/15"     },
  { id: "tank",    title: "Tank Check List",       desc: "Bồn chứa, mức & rò rỉ",      stations: 4, items: 18, art: "tank",    tint: "bg-cyan-100 dark:bg-cyan-500/15"     },
  { id: "routine", title: "Routine Check List",    desc: "Tuần tra định kỳ hằng ngày", stations: 8, items: 32, art: "routine", tint: "bg-emerald-100 dark:bg-emerald-500/15" },
  { id: "valve",   title: "Valve Check List",      desc: "Van & đường ống",            stations: 5, items: 15, art: "valve",   tint: "bg-violet-100 dark:bg-violet-500/15" },
  { id: "safety",  title: "Safety Check List",     desc: "An toàn & PCCC",             stations: 7, items: 28, art: "safety",  tint: "bg-amber-100 dark:bg-amber-500/15"   },
  { id: "elec",    title: "Electrical Check List", desc: "Tủ điện & nguồn",            stations: 3, items: 12, art: "elec",    tint: "bg-red-100 dark:bg-red-500/15"       },
];

const BARS = {
  pump: "bg-blue-500", tank: "bg-cyan-500", routine: "bg-emerald-500",
  valve: "bg-violet-500", safety: "bg-amber-500", elec: "bg-red-500",
};
// ---------------------------------------------------------------------------
// Checklist card — tap toàn thẻ
// ---------------------------------------------------------------------------
function ChecklistCard({ item, progress = 0, onClick }) {
  const Art = CHECKLIST_ART[item.art];
  const pct = Math.round((progress / item.stations) * 100);
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[20px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3.5 flex items-center gap-3.5 active:bg-slate-50 dark:active:bg-slate-700/60 transition-colors"
    >
      <div className={["w-[60px] h-[60px] rounded-2xl flex items-center justify-center flex-shrink-0 p-2", item.tint].join(" ")}>
        <Art/>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-bold text-slate-900 dark:text-slate-100 truncate">
          {item.title}
        </div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
          {item.desc}
        </div>
        {/* meta + progress */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={["h-full rounded-full transition-all", BARS[item.art]].join(" ")} style={{ width: `${pct}%` }}/>
          </div>
          <span className="text-[12px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
            {progress}/{item.stations} trạm
          </span>
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 flex-shrink-0"/>
    </button>
  );
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------
export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // TODO: tiến độ thật theo từng checklist (localStorage / API)
  const progressMap = { pump: 2, tank: 0, routine: 5, valve: 1, safety: 0, elec: 0 };
  // TODO: id checklist đã mở gần đây
  const recentId = "routine";
  const recent = CHECKLISTS.find((c) => c.id === recentId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHECKLISTS;
    return CHECKLISTS.filter(
      (c) => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [query]);

  const go = (item) => navigate(`/scan/${item.id}`);

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5 py-2">
      {/* Greeting */}
      <div className="px-1">
        <div className="text-[13px] font-medium text-slate-400 dark:text-slate-500">
          Chào buổi sáng 👋
        </div>
        <h1 className="text-[26px] font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
          Chọn loại checklist
        </h1>
        <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
          Chọn bộ kiểm tra rồi bắt đầu quét QR theo trạm
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm checklist…"
          className="w-full min-h-[52px] pl-11 pr-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Tiếp tục gần đây */}
      {recent && !query && (
        <button
          onClick={() => go(recent)}
          className="w-full text-left rounded-[20px] bg-blue-600 text-white p-4 flex items-center gap-4 active:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
        >
          <div className="w-[60px] h-[60px] rounded-2xl bg-white flex items-center justify-center flex-shrink-0 p-2">
            {(() => { const Art = CHECKLIST_ART[recent.art]; return <Art/>; })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-blue-100">
              Tiếp tục
            </div>
            <div className="text-[17px] font-bold truncate">{recent.title}</div>
            <div className="text-[13px] text-blue-100">
              {progressMap[recent.id]}/{recent.stations} trạm đã quét
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-white/80 flex-shrink-0"/>
        </button>
      )}

      {/* Section label */}
      <div className="flex items-center justify-between px-1 -mb-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Tất cả checklist
        </h2>
        <span className="text-[13px] text-slate-400 dark:text-slate-500">
          {filtered.length} bộ
        </span>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {filtered.map((item) => (
          <ChecklistCard
            key={item.id}
            item={item}
            progress={progressMap[item.id] || 0}
            onClick={() => go(item)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-[15px]">
            Không tìm thấy checklist nào
          </div>
        )}
      </div>
    </div>
  );
}

export { CHECKLISTS };
