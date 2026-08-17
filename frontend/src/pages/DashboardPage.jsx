import { useCallback, useEffect, useState } from "react";
import {
  BarChart3, AlertTriangle, Clock, MapPin, TrendingDown, TrendingUp, Minus,
  RefreshCw, Inbox,
} from "lucide-react";
import { getDashboard } from "../lib/api";
import {
  heatmapMax, busiestHour, formatHour, formatPercent, trendSymbol,
} from "../lib/dashboard";

const DAY_OPTIONS = [
  { value: 7,  label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
];

// Nhãn + màu cho từng geo_status (đồng bộ với email/báo cáo)
const GEO_META = {
  ok:           { label: "Đúng vị trí",   color: "bg-green-500" },
  out_of_range: { label: "Ngoài phạm vi", color: "bg-red-500" },
  cached:       { label: "Vị trí cache",  color: "bg-amber-500" },
  unverified:   { label: "Chưa xác minh", color: "bg-slate-400" },
  no_gps:       { label: "Không GPS",     color: "bg-slate-500" },
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900";

function fmtLastScan(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtTime(date) {
  try {
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatCard({ icon: Icon, label, value, hint, tone = "default" }) {
  const toneClass = {
    default: "text-slate-800 dark:text-slate-100",
    danger:  "text-red-600 dark:text-red-400",
    info:    "text-blue-600 dark:text-blue-400",
  }[tone];
  return (
    <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

// Khung section chung — giữ card style đồng nhất toàn dashboard
function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
        <Icon className="w-4 h-4" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

function SectionEmpty({ message = "Chưa có dữ liệu" }) {
  return <p className="text-sm text-slate-400 py-4 text-center">{message}</p>;
}

// Heatmap 24 giờ — cột CSS, cao theo tỷ lệ scan
function HourHeatmap({ heatmap, total }) {
  const max = heatmapMax(heatmap);
  const peak = busiestHour(heatmap);
  return (
    <Section icon={Clock} title="Giờ quét trong ngày">
      {max === 0 ? (
        <SectionEmpty />
      ) : (
        <>
          {/* Tóm tắt cho screen reader — chart cột chỉ là hình ảnh */}
          <p className="sr-only">
            Biểu đồ số lượt quét theo 24 giờ trong ngày. Tổng {total} lượt, cao điểm lúc {formatHour(peak)} với {heatmap[peak]} lượt.
          </p>
          <div
            className="flex items-end gap-[2px] h-28 border-b border-slate-100 dark:border-slate-700"
            role="img"
            aria-label={`Biểu đồ giờ quét, cao điểm ${formatHour(peak)}`}
          >
            {heatmap.map((count, h) => (
              <div key={h} className="flex-1 flex flex-col justify-end h-full" title={`${formatHour(h)} · ${count} lượt`}>
                <div
                  className={`rounded-t ${h === peak ? "bg-blue-600 dark:bg-blue-400" : "bg-blue-300 dark:bg-blue-500/50"}`}
                  style={{ height: `${Math.max((count / max) * 100, count > 0 ? 6 : 0)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1" aria-hidden>
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>
          {peak != null && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Cao điểm: <span className="font-semibold text-blue-600 dark:text-blue-400">{formatHour(peak)}</span>
              <span className="text-slate-400"> · {heatmap[peak]} lượt</span>
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// Phân bố geo_status — thanh ngang theo tỷ lệ, kèm % trực tiếp
function GeoBreakdown({ geo }) {
  const { counts, total } = geo;
  return (
    <Section icon={MapPin} title="Chất lượng vị trí GPS">
      {total === 0 ? (
        <SectionEmpty />
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(GEO_META).map(([key, meta]) => {
            const c = counts[key] || 0;
            if (c === 0) return null;
            const pct = (c / total) * 100;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-28 flex-shrink-0 text-xs text-slate-600 dark:text-slate-300">{meta.label}</span>
                <div className="flex-1 h-5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden" aria-hidden>
                  <div className={`h-full ${meta.color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 flex-shrink-0 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{c}</span>
                  <span className="text-slate-400 dark:text-slate-500"> · {formatPercent(c / total)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// Bảng trạm hoạt động — kèm thanh tỷ lệ để so sánh trực quan giữa các trạm
function StationTable({ stations }) {
  const maxTotal = stations.reduce((m, s) => (s.total > m ? s.total : m), 0) || 1;
  return (
    <Section icon={BarChart3} title="Hoạt động theo trạm">
      {stations.length === 0 ? (
        <SectionEmpty />
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {stations.map((s) => (
            <div key={s.station} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{s.station}</div>
                <div className="text-[11px] text-slate-400">Gần nhất: {fmtLastScan(s.last_scan)}</div>
                <div className="mt-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden" aria-hidden>
                  <div
                    className="h-full rounded-full bg-blue-400 dark:bg-blue-500"
                    style={{ width: `${(s.total / maxTotal) * 100}%` }}
                  />
                </div>
              </div>
              {s.out_of_range > 0 && (
                <span
                  className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full"
                  aria-label={`${s.out_of_range} lượt ngoài phạm vi`}
                  title={`${s.out_of_range} lượt ngoài phạm vi`}
                >
                  <AlertTriangle className="w-3 h-3" aria-hidden /> {s.out_of_range}
                </span>
              )}
              <span className="w-12 text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{s.total}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// Sparkline SVG nhỏ cho xu hướng thông số
function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 80, H = 24;
  const coords = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0" aria-hidden>
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TrendCard({ trend }) {
  const dirMeta = {
    down: { Icon: TrendingDown, cls: "text-red-500", word: "giảm" },
    up:   { Icon: TrendingUp,   cls: "text-green-500", word: "tăng" },
    flat: { Icon: Minus,        cls: "text-slate-400", word: "ổn định" },
  }[trend.direction] || { Icon: Minus, cls: "text-slate-400", word: "ổn định" };
  const { Icon } = dirMeta;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {trend.tag && <span className="font-mono text-xs text-blue-600 dark:text-blue-400 mr-1">{trend.tag}</span>}
          {trend.label || "Thông số"}
        </div>
        <div className="text-[11px] text-slate-400 truncate">
          {trend.station} · {trend.points.length} mẫu
          {trend.breaches > 0 && (
            <span className="text-red-500 font-semibold"> · {trend.breaches} vượt ngưỡng</span>
          )}
        </div>
      </div>
      <div className={dirMeta.cls}><Sparkline points={trend.points} /></div>
      <div
        className={`flex items-center gap-0.5 font-bold tabular-nums ${dirMeta.cls}`}
        aria-label={`Giá trị mới nhất ${trend.latest}${trend.unit ? ` ${trend.unit}` : ""}, xu hướng ${dirMeta.word}`}
      >
        <Icon className="w-4 h-4" aria-hidden />
        <span className="text-sm">{trend.latest}{trend.unit ? ` ${trend.unit}` : ""}</span>
        <span aria-hidden>{trendSymbol(trend.direction)}</span>
      </div>
    </div>
  );
}

function ParamTrends({ trends }) {
  return (
    <Section icon={TrendingDown} title="Xu hướng thông số">
      {trends.length === 0 ? (
        <SectionEmpty message="Chưa có thông số nào được ghi" />
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {trends.map((t, i) => <TrendCard key={`${t.station}-${t.tag}-${i}`} trend={t} />)}
        </div>
      )}
    </Section>
  );
}

// Skeleton giữ đúng khung layout thật → không giật layout khi dữ liệu về
function DashboardSkeleton() {
  const block = "rounded bg-slate-200 dark:bg-slate-700 motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Đang tải dữ liệu thống kê" className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
            <div className={`h-3 w-16 mb-2 ${block}`} />
            <div className={`h-7 w-12 ${block}`} />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
          <div className={`h-3.5 w-36 mb-4 ${block}`} />
          <div className={`h-24 w-full ${block}`} />
        </div>
      ))}
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}

// Không có lượt quét nào trong kỳ → 1 empty state gọn thay vì 4 section rỗng
function DashboardEmpty({ days }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center text-center gap-2">
      <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600" aria-hidden />
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        Chưa có lượt quét nào trong {days} ngày qua
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
        Dữ liệu sẽ xuất hiện khi nhân viên quét QR tại trạm. Thử chọn khoảng thời gian dài hơn.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [days, setDays]         = useState(7);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboard(days)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setUpdatedAt(new Date());
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Không tải được dữ liệu thống kê");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, reloadKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" aria-hidden /> Thống kê
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden" role="group" aria-label="Khoảng thời gian thống kê">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                aria-pressed={days === opt.value}
                className={`cursor-pointer px-3 py-2 text-sm font-medium transition-colors ${FOCUS_RING} ${
                  days === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Tải lại thống kê"
            title="Tải lại"
            className={`cursor-pointer rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-slate-500 dark:text-slate-300 transition-colors active:bg-slate-100 dark:active:bg-slate-700 disabled:opacity-40 disabled:cursor-default ${FOCUS_RING}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {updatedAt && !loading && !error && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
          Cập nhật lúc {fmtTime(updatedAt)}
        </p>
      )}

      {loading && <DashboardSkeleton />}

      {error && !loading && (
        <div role="alert" className="rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">{error}</span>
          <button
            onClick={refresh}
            className={`cursor-pointer rounded-lg border border-red-300 dark:border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 active:bg-red-100 dark:active:bg-red-500/20 transition-colors ${FOCUS_RING}`}
          >
            Thử lại
          </button>
        </div>
      )}

      {data && !loading && !error && (
        data.total === 0 ? (
          <DashboardEmpty days={days} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={BarChart3} label="Tổng lượt" value={data.total} hint={`trong ${days} ngày`} />
              <StatCard
                icon={AlertTriangle}
                label="Ngoài phạm vi"
                value={formatPercent(data.geo.out_of_range_rate)}
                hint={`${data.geo.counts?.out_of_range || 0} lượt`}
                tone={data.geo.out_of_range_rate > 0 ? "danger" : "default"}
              />
              <StatCard
                icon={Clock}
                label="Cao điểm"
                value={busiestHour(data.heatmap) != null ? formatHour(busiestHour(data.heatmap)) : "—"}
                hint="giờ nhiều lượt nhất"
                tone="info"
              />
            </div>

            <HourHeatmap heatmap={data.heatmap} total={data.total} />
            <GeoBreakdown geo={data.geo} />
            <StationTable stations={data.stations} />
            <ParamTrends trends={data.param_trends} />
          </>
        )
      )}
    </div>
  );
}
