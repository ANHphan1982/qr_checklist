// HomePage.jsx — màn hình chọn loại checklist trước khi scan
// Mỗi checklist là 1 thẻ lớn (hit-target toàn thẻ), bấm vào sẽ route tới
// /scan/:type để bắt đầu quét đúng bộ checklist tương ứng.
//
// Tối ưu Android: card bo lớn, ảnh/icon 64px, label rõ, progress bar,
// search lọc nhanh, "Tiếp tục" để mở lại checklist hay dùng.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, SearchX, AlertTriangle, CheckCircle2, FileSpreadsheet, Mail, Loader2, RefreshCw, Info, X, QrCode, MapPin, WifiOff, UserRound } from "lucide-react";
import { CHECKLIST_ART, IMAGE_ART } from "../components/ChecklistArt";
import { CHECKLISTS } from "../lib/checklists";
import { getReports, getChecklistStations, getStationParamConfigs, emailChecklistExcel } from "../lib/api";
import { exportHistoryToExcel, buildHistoryWorkbookBase64 } from "../lib/exportExcel";
import { getShiftAt } from "../lib/shifts";
import { getPeriodAt, vnDatesInRange, frequencyShortLabel } from "../lib/frequencies";
import { getEffectiveFrequencySetting, loadFrequencyOverrides } from "../lib/checklistFrequency";
import { computeCoverage, selectChecklistShiftLogs, checklistCardCounts, summarizeCoverage } from "../lib/checklistCoverage";
import { getStationsFor } from "../lib/checklistStations";
import { saveRecentChecklist, loadRecentChecklist } from "../lib/recentChecklist";
import { saveEmployeeName, loadEmployeeName } from "../lib/employeeName";
import { shouldShowOnboarding, markOnboardingSeen } from "../lib/onboarding";
import { useToast } from "../components/ui/Toast";

// Chỉ hiện ô tìm kiếm khi danh sách dài; ít mục thì search chỉ gây nhiễu.
const SEARCH_MIN_ITEMS = 8;

// CHECKLISTS chuyển sang lib/checklists.js để ScanPage & admin dùng chung.

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
// ShiftOverviewCard — tổng quan tiến độ ca (đã/tổng trạm) + nút Làm mới
// ---------------------------------------------------------------------------
function ShiftOverviewCard({ shift, overview, refreshing, onRefresh }) {
  const { totalStations, checkedStations, missingStations, allDone } = overview;
  const pct = totalStations > 0 ? Math.round((checkedStations / totalStations) * 100) : 0;
  return (
    <div className={[
      "rounded-2xl border px-4 py-3",
      allDone
        ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
        : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",
    ].join(" ")} role="status">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {allDone ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" aria-hidden />
          )}
          <span className={[
            "text-[13px] font-semibold truncate",
            allDone ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300",
          ].join(" ")}>
            {shift.label} · {allDone ? `Đã kiểm tra đủ ${totalStations} trạm` : `còn ${missingStations} trạm chưa kiểm tra`}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Làm mới tiến độ"
          className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 active:bg-black/5 dark:active:bg-white/5 disabled:opacity-60"
        >
          <RefreshCw className={["w-4 h-4", refreshing ? "animate-spin" : ""].join(" ")} aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div
            className={["h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-amber-500"].join(" ")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[12px] font-semibold tabular-nums text-slate-500 dark:text-slate-400 flex-shrink-0">
          {checkedStations}/{totalStations}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingCard — 3 mẹo nhanh cho người dùng lần đầu
// ---------------------------------------------------------------------------
const TIPS = [
  { Icon: QrCode,  text: "Chọn checklist rồi quét QR tại từng trạm để check-in." },
  { Icon: MapPin,  text: "Bật GPS giúp xác thực bạn có mặt đúng trạm." },
  { Icon: WifiOff, text: "Mất mạng vẫn quét được — app tự đồng bộ khi có mạng lại." },
];

function OnboardingCard({ onDismiss }) {
  return (
    <div className="relative rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-4 py-3.5">
      <button
        onClick={onDismiss}
        aria-label="Đã hiểu, đóng hướng dẫn"
        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg flex items-center justify-center text-blue-500/70 active:bg-blue-100 dark:active:bg-blue-500/20"
      >
        <X className="w-4.5 h-4.5" aria-hidden />
      </button>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-blue-800 dark:text-blue-300 mb-2.5">
        <Info className="w-4 h-4 flex-shrink-0" aria-hidden />
        Cách dùng nhanh
      </div>
      <ul className="flex flex-col gap-2">
        {TIPS.map(({ Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] text-blue-900/90 dark:text-blue-200">
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShiftOverviewSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 animate-pulse">
      <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist card — tap toàn thẻ
// ---------------------------------------------------------------------------
function ChecklistCard({ item, progress = 0, total = item.stations, onClick }) {
  const Art = CHECKLIST_ART[item.art];
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  const done = total > 0 && pct === 100;
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
            {progress}/{total} trạm
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
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showTips, setShowTips] = useState(() => shouldShowOnboarding());
  const dismissTips = () => { markOnboardingSeen(); setShowTips(false); };

  // Mốc "bây giờ" cố định trong phiên xem → ca + chu kỳ tính nhất quán.
  const [now] = useState(() => Date.now());
  // Ca hiện tại (cho thẻ tổng quan) — coverage từng checklist dùng chu kỳ riêng.
  const [shift] = useState(() => getShiftAt(new Date(now)));
  // Tần suất admin override (localStorage, theo thiết bị). Đọc 1 lần khi mount.
  const [freqOverrides] = useState(() => loadFrequencyOverrides());
  const [scans, setScans] = useState([]);

  // Chu kỳ ghi thông số hiện tại theo TỪNG checklist (tuỳ tần suất). Cùng shape
  // {startMs,endMs,label} với ca → computeCoverage nhận trực tiếp.
  const periods = useMemo(() => {
    const d = new Date(now);
    const map = {};
    for (const c of CHECKLISTS) {
      map[c.id] = getPeriodAt(getEffectiveFrequencySetting(c, freqOverrides), d);
    }
    return map;
  }, [now, freqOverrides]);

  // Mốc sớm nhất cần tải report (chu kỳ dài như tháng vắt qua nhiều ngày VN).
  const fetchStartMs = useMemo(
    () => Math.min(now, ...Object.values(periods).map((p) => p.startMs)),
    [now, periods]
  );
  // Mapping checklist → trạm đọc từ backend (đồng bộ mọi thiết bị, Hướng A).
  const [assignments, setAssignments] = useState({});
  // paramConfigs: map station_name → cấu hình thông số — để Excel xuất ra có
  // cột "Cảnh báo" giống trang Lịch sử (fallback localStorage khi offline).
  const paramConfigsRef = useRef({});

  useEffect(() => {
    getStationParamConfigs()
      .then((configs) => {
        const map = {};
        configs.forEach((c) => { map[c.station_name] = c; });
        paramConfigsRef.current = map;
      })
      .catch(() => {
        try {
          paramConfigsRef.current = JSON.parse(
            localStorage.getItem("qr_station_param_configs") || "{}"
          );
        } catch (_) {}
      });
  }, []);

  // loading: chỉ true ở lần tải đầu (chưa có dữ liệu) → hiện skeleton, tránh
  // layout shift. Lần "Làm mới" sau đó dùng refreshing để không nháy skeleton.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnceRef = useRef(false);

  const fetchCoverage = useCallback(async () => {
    if (loadedOnceRef.current) setRefreshing(true);
    // Chu kỳ có thể vắt qua nhiều ngày VN (ca đêm, hoặc tần suất ngày/tháng).
    // Lấy mọi ngày VN trong [đầu chu kỳ sớm nhất, hiện tại], gộp logs.
    // Lỗi mạng → bỏ qua (offline-safe).
    const dates = vnDatesInRange(fetchStartMs, now);
    try {
      const [reportResults, assignMap] = await Promise.all([
        Promise.all(dates.map((d) => getReports(d).catch(() => null))),
        getChecklistStations().catch(() => ({})),
      ]);
      setScans(reportResults.filter(Boolean).flatMap((r) => r.logs || []));
      setAssignments(assignMap);
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchStartMs, now]);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  // Coverage theo từng checklist (chỉ tính checklist đã gán trạm) — mỗi checklist
  // dùng chu kỳ riêng theo tần suất đã cấu hình.
  const coverageMap = useMemo(() => {
    const map = {};
    for (const c of CHECKLISTS) {
      const stationNames = getStationsFor(assignments, c.id);
      if (stationNames.length > 0) map[c.id] = computeCoverage(stationNames, scans, periods[c.id]);
    }
    return map;
  }, [assignments, scans, periods]);

  // Trạng thái gửi email theo từng checklist: undefined|"sending"|"sent"|"error"
  const [emailState, setEmailState] = useState({});

  const checklistLogs = (item) => {
    const stationNames = getStationsFor(assignments, item.id);
    // Lọc scan của checklist trong CHU KỲ hiện tại, CÙNG cấu trúc với trang Lịch
    // sử (đầy đủ GPS, route assessment, thông số, cảnh báo).
    return selectChecklistShiftLogs(stationNames, scans, periods[item.id]);
  };

  // Tên nhân viên thực hiện checklist — persist theo thiết bị, in vào form
  // báo cáo (phía trên header bảng) khi xuất Excel/email.
  const [employeeName, setEmployeeName] = useState(() => loadEmployeeName());
  const onEmployeeNameChange = (e) => {
    setEmployeeName(e.target.value);
    saveEmployeeName(e.target.value);
  };

  // Thông tin form báo cáo cho file Excel: ca/chu kỳ hiện tại + nhân viên.
  const reportInfoFor = (item) => ({
    shiftLabel: periods[item.id].label,
    employeeName: employeeName.trim(),
  });

  const exportChecklist = (item) => {
    const logs = checklistLogs(item);
    exportHistoryToExcel(logs, `${item.id}-${periods[item.id].id}.xlsx`, paramConfigsRef.current, reportInfoFor(item));
    toast.success(`Đã tạo file Excel ${item.title} (${logs.length} lượt)`);
  };

  // Gửi email kèm file Excel checklist cho quản lý. Dựng cùng workbook với nút
  // Excel rồi POST base64 lên backend (Resend đính kèm file).
  const emailChecklist = async (item) => {
    if (emailState[item.id] === "sending") return;
    setEmailState((s) => ({ ...s, [item.id]: "sending" }));
    try {
      const filename = `${item.id}-${periods[item.id].id}.xlsx`;
      const fileBase64 = buildHistoryWorkbookBase64(checklistLogs(item), paramConfigsRef.current, reportInfoFor(item));
      await emailChecklistExcel({
        subject: `[Checklist] ${item.title} — ${periods[item.id].label}`,
        filename,
        fileBase64,
      });
      setEmailState((s) => ({ ...s, [item.id]: "sent" }));
      toast.success(`Đã gửi email checklist ${item.title}`);
    } catch (_) {
      setEmailState((s) => ({ ...s, [item.id]: "error" }));
      toast.error(`Gửi email ${item.title} thất bại — thử lại`);
    }
  };

  // Checklist mở gần nhất (thật, từ localStorage) — ẩn thẻ nếu chưa từng mở.
  const [recentId] = useState(() => loadRecentChecklist());
  const recent = recentId ? CHECKLISTS.find((c) => c.id === recentId) : null;
  const RecentArt = recent ? CHECKLIST_ART[recent.art] : null;
  // Tiến độ thật của checklist "Tiếp tục" — khớp coverage trong ca.
  const recentCounts = checklistCardCounts(
    recent ? coverageMap[recent.id] : null,
    recent ? recent.stations : 0
  );

  // Tổng quan ca: gộp coverage mọi checklist đã gán trạm.
  const overview = useMemo(() => summarizeCoverage(coverageMap), [coverageMap]);

  const showSearch = CHECKLISTS.length >= SEARCH_MIN_ITEMS;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHECKLISTS;
    return CHECKLISTS.filter(
      (c) => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [query]);

  const go = (item) => {
    saveRecentChecklist(item.id);
    navigate(`/scan/${item.id}`);
  };

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

      {/* Tên nhân viên thực hiện — persist theo thiết bị, in vào form báo cáo Excel */}
      <div className="relative">
        <UserRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
        <input
          type="text"
          value={employeeName}
          onChange={onEmployeeNameChange}
          placeholder="Tên nhân viên thực hiện"
          aria-label="Tên nhân viên thực hiện checklist"
          autoComplete="name"
          className="w-full min-h-[52px] pl-12 pr-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-[16px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Hướng dẫn lần đầu — chỉ hiện ở lần mở app đầu tiên */}
      {showTips && <OnboardingCard onDismiss={dismissTips} />}

      {/* Tổng quan ca — skeleton khi tải lần đầu, sau đó hiện tiến độ + nút Làm mới */}
      {loading ? (
        <ShiftOverviewSkeleton />
      ) : (
        overview.hasData && (
          <ShiftOverviewCard
            shift={shift}
            overview={overview}
            refreshing={refreshing}
            onRefresh={fetchCoverage}
          />
        )
      )}

      {/* Search — chỉ hiện khi danh sách dài */}
      {showSearch && (
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
      )}

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
              {recentCounts.checked}/{recentCounts.total} trạm đã quét
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
        {filtered.map((item) => {
          const cov = coverageMap[item.id];
          // Số trên thẻ lấy từ coverage thật → khớp dòng cảnh báo bên dưới
          // (tránh "2/6 trạm" giả mâu thuẫn với "Còn 13/13 trạm chưa kiểm tra").
          const counts = checklistCardCounts(cov, item.stations);
          // Nhãn tần suất hiệu lực (vd "1 lần/ca", "1 lần/tháng (ngày 15)").
          const freqShort = frequencyShortLabel(getEffectiveFrequencySetting(item, freqOverrides));
          return (
            <div key={item.id} className="flex flex-col gap-1.5">
              <ChecklistCard
                item={item}
                progress={counts.checked}
                total={counts.total}
                onClick={() => go(item)}
              />
              {cov && (
                <div className="flex items-center justify-between gap-2 px-2.5">
                  {cov.ok ? (
                    <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                      <span className="truncate">Đã kiểm tra đủ {cov.total} trạm{freqShort ? ` (${freqShort})` : ""}</span>
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                      <span className="truncate">Còn {cov.missingCount}/{cov.total} trạm chưa kiểm tra{freqShort ? ` (${freqShort})` : ""}</span>
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => exportChecklist(item)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg active:bg-blue-50 dark:active:bg-blue-500/10"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden />
                      Excel
                    </button>
                    <button
                      onClick={() => emailChecklist(item)}
                      disabled={emailState[item.id] === "sending"}
                      aria-label={`Gửi email checklist ${item.title}`}
                      className={[
                        "flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg disabled:opacity-60",
                        emailState[item.id] === "sent"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : emailState[item.id] === "error"
                          ? "text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-500/10"
                          : "text-blue-600 dark:text-blue-400 active:bg-blue-50 dark:active:bg-blue-500/10",
                      ].join(" ")}
                    >
                      {emailState[item.id] === "sending" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : emailState[item.id] === "sent" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Mail className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {emailState[item.id] === "sending"
                        ? "Đang gửi"
                        : emailState[item.id] === "sent"
                        ? "Đã gửi"
                        : emailState[item.id] === "error"
                        ? "Lỗi, thử lại"
                        : "Email"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
