// HomePage.jsx — màn hình chọn loại checklist trước khi scan
// Mỗi checklist là 1 thẻ lớn (hit-target toàn thẻ), bấm vào sẽ route tới
// /scan/:type để bắt đầu quét đúng bộ checklist tương ứng.
//
// Tối ưu Android: card bo lớn, ảnh/icon 64px, label rõ, progress bar,
// search lọc nhanh, "Tiếp tục" để mở lại checklist hay dùng.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, SearchX } from "lucide-react";
import { CHECKLIST_ART, IMAGE_ART } from "../components/ChecklistArt";

// ---------------------------------------------------------------------------
// Định nghĩa các checklist — thay bằng nguồn dữ liệu thật của bạn.
// `art` = id hình minh họa trong CHECKLIST_ART; `accent` = màu nhấn (progress,
// icon, viền) theo từng loại.
// ---------------------------------------------------------------------------
const CHECKLISTS = [
  { id: "pump",    title: "Pump Check List",       desc: "Kiểm tra bơm & động cơ",     stations: 6, items: 24, art: "pump",    accent: "blue"    },
  { id: "tank",    title: "Tank Check List",       desc: "Bồn chứa, mức & rò rỉ",      stations: 4, items: 18, art: "tank",    accent: "cyan"    },
  { id: "routine", title: "Routine Check List",    desc: "Tuần tra định kỳ hằng ngày", stations: 8, items: 32, art: "routine", accent: "emerald" },
  { id: "valve",   title: "Valve Check List",      desc: "Van & đường ống",            stations: 5, items: 15, art: "valve",   accent: "violet"  },
  { id: "safety",  title: "Safety Check List",     desc: "An toàn & PCCC",             stations: 7, items: 28, art: "safety",  accent: "amber"   },
  { id: "elec",    title: "Electrical Check List", desc: "Tủ điện & nguồn",            stations: 3, items: 12, art: "elec",    accent: "red"     },
];

// Bảng class theo màu nhấn — tách rõ để Tailwind không bị purge (không nối chuỗi động).
const ACCENT = {
  blue:    { bar: "bg-blue-500",    tile: "bg-blue-100 dark:bg-blue-500/15",       icon: "text-blue-600 dark:text-blue-400"       },
  cyan:    { bar: "bg-cyan-500",    tile: "bg-cyan-100 dark:bg-cyan-500/15",       icon: "text-cyan-600 dark:text-cyan-400"       },
  emerald: { bar: "bg-emerald-500", tile: "bg-emerald-100 dark:bg-emerald-500/15", icon: "text-emerald-600 dark:text-emerald-400" },
  violet:  { bar: "bg-violet-500",  tile: "bg-violet-100 dark:bg-violet-500/15",   icon: "text-violet-600 dark:text-violet-400"   },
  amber:   { bar: "bg-amber-500",   tile: "bg-amber-100 dark:bg-amber-500/15",     icon: "text-amber-600 dark:text-amber-400"     },
  red:     { bar: "bg-red-500",     tile: "bg-red-100 dark:bg-red-500/15",         icon: "text-red-600 dark:text-red-400"         },
};

// Nền ô hình: ảnh sản phẩm → nền trắng + viền nhẹ cho ảnh nổi; icon → nền tint màu.
function artTileClass(item) {
  if (IMAGE_ART.has(item.art)) {
    return "bg-white ring-1 ring-slate-200/80 dark:bg-white dark:ring-slate-300 p-1.5";
  }
  return [ACCENT[item.accent].tile, ACCENT[item.accent].icon, "p-3"].join(" ");
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

// ---------------------------------------------------------------------------
// Checklist card — tap toàn thẻ
// ---------------------------------------------------------------------------
function ChecklistCard({ item, progress = 0, onClick }) {
  const Art = CHECKLIST_ART[item.art];
  const pct = Math.min(100, Math.round((progress / item.stations) * 100));
  const done = pct === 100;
  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-3xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-3 flex items-center gap-3.5 shadow-sm active:scale-[0.99] active:bg-slate-50 dark:active:bg-slate-700/60 transition-all"
    >
      <div className={["w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden", artTileClass(item)].join(" ")}>
        <Art />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[16px] font-bold text-slate-900 dark:text-slate-100 truncate">
            {item.title}
          </div>
          {done && (
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Xong
            </span>
          )}
        </div>
        <div className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
          {item.desc}
        </div>
        {/* meta + progress */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={["h-full rounded-full transition-all", ACCENT[item.accent].bar].join(" ")} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
            {progress}/{item.stations} trạm
          </span>
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 flex-shrink-0 group-active:translate-x-0.5 transition-transform" aria-hidden />
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
  const RecentArt = recent ? CHECKLIST_ART[recent.art] : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHECKLISTS;
    return CHECKLISTS.filter(
      (c) => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [query]);

  const go = (item) => navigate(`/scan/${item.id}`);

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5 py-1">
      {/* Greeting */}
      <div className="px-1">
        <div className="text-[13px] font-medium text-slate-400 dark:text-slate-500">
          {greeting()} 👋
        </div>
        <h1 className="text-[27px] font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
          Chọn loại checklist
        </h1>
        <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
          Chọn bộ kiểm tra rồi bắt đầu quét QR theo trạm
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm checklist…"
          aria-label="Tìm checklist"
          className="w-full min-h-[52px] pl-12 pr-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Tiếp tục gần đây */}
      {recent && !query && (
        <button
          onClick={() => go(recent)}
          className="relative w-full text-left rounded-3xl p-4 flex items-center gap-4 text-white overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25 active:scale-[0.99] transition-transform"
        >
          {/* họa tiết tròn mờ trang trí */}
          <div className="absolute -right-6 -top-10 w-32 h-32 rounded-full bg-white/10" aria-hidden />
          <div className="relative w-16 h-16 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 p-1.5 overflow-hidden">
            {RecentArt && <RecentArt />}
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-blue-100">
              Tiếp tục
            </div>
            <div className="text-[17px] font-bold truncate">{recent.title}</div>
            <div className="text-[13px] text-blue-100 mt-0.5">
              {progressMap[recent.id]}/{recent.stations} trạm đã quét
            </div>
          </div>
          <ChevronRight className="relative w-6 h-6 text-white/80 flex-shrink-0" aria-hidden />
        </button>
      )}

      {/* Section label */}
      <div className="flex items-center justify-between px-1 -mb-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Tất cả checklist
        </h2>
        <span className="text-[12px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
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
          <div className="flex flex-col items-center text-center py-12 text-slate-400 dark:text-slate-500">
            <SearchX className="w-10 h-10 mb-3 opacity-70" aria-hidden />
            <div className="text-[15px] font-medium">Không tìm thấy checklist nào</div>
            <div className="text-[13px] mt-0.5">Thử từ khóa khác xem sao</div>
          </div>
        )}
      </div>
    </div>
  );
}

export { CHECKLISTS };
