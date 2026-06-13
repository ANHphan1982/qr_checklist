import { useEffect, useState } from "react";
import {
  BarChart3, AlertTriangle, Clock, MapPin, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import { getDashboard } from "../lib/api";
import {
  heatmapMax, busiestHour, formatHour, formatPercent, trendSymbol,
} from "../lib/dashboard";

const DAY_OPTIONS = [7, 30, 90];

// Nhãn + màu cho từng geo_status (đồng bộ với email/báo cáo)
const GEO_META = {
  ok:           { label: "Đúng vị trí",   color: "bg-green-500" },
  out_of_range: { label: "Ngoài phạm vi", color: "bg-red-500" },
  cached:       { label: "Vị trí cache",  color: "bg-amber-500" },
  unverified:   { label: "Chưa xác minh", color: "bg-slate-400" },
  no_gps:       { label: "Không GPS",     color: "bg-slate-500" },
};

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

function StatCard({ icon: Icon, label, value, tone = "default" }) {
  const toneClass = {
    default: "text-slate-800 dark:text-slate-100",
    danger:  "text-red-600 dark:text-red-400",
    info:    "text-blue-600 dark:text-blue-400",
  }[tone];
  return (
    <div className="flex-1 min-w-0 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

// Heatmap 24 giờ — cột CSS, cao theo tỷ lệ scan
function HourHeatmap({ heatmap }) {
  const max = heatmapMax(heatmap);
  const peak = busiestHour(heatmap);
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
        <Clock className="w-4 h-4" aria-hidden /> Giờ quét trong ngày
      </h2>
      {max === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Chưa có dữ liệu</p>
      ) : (
        <>
          <div className="flex items-end gap-[2px] h-28">
            {heatmap.map((count, h) => (
              <div key={h} className="flex-1 flex flex-col justify-end h-full" title={`${formatHour(h)} · ${count} lượt`}>
                <div
                  className={`rounded-t ${h === peak ? "bg-blue-600 dark:bg-blue-400" : "bg-blue-300 dark:bg-blue-500/50"}`}
                  style={{ height: `${Math.max((count / max) * 100, count > 0 ? 6 : 0)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>
          {peak != null && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Cao điểm: <span className="font-semibold text-blue-600 dark:text-blue-400">{formatHour(peak)}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Phân bố geo_status — thanh ngang theo tỷ lệ
function GeoBreakdown({ geo }) {
  const { counts, total } = geo;
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
        <MapPin className="w-4 h-4" aria-hidden /> Chất lượng vị trí GPS
      </h2>
      {total === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Chưa có dữ liệu</p>
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(GEO_META).map(([key, meta]) => {
            const c = counts[key] || 0;
            if (c === 0) return null;
            const pct = (c / total) * 100;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-28 flex-shrink-0 text-xs text-slate-600 dark:text-slate-300">{meta.label}</span>
                <div className="flex-1 h-5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-full ${meta.color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{c}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Bảng trạm hoạt động
function StationTable({ stations }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-4 h-4" aria-hidden /> Hoạt động theo trạm
      </h2>
      {stations.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Chưa có dữ liệu</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {stations.map((s) => (
            <div key={s.station} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{s.station}</div>
                <div className="text-[11px] text-slate-400">Gần nhất: {fmtLastScan(s.last_scan)}</div>
              </div>
              {s.out_of_range > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" aria-hidden /> {s.out_of_range}
                </span>
              )}
              <span className="w-12 text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{s.total}</span>
            </div>
          ))}
        </div>
      )}
    </section>
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
    down: { Icon: TrendingDown, cls: "text-red-500" },
    up:   { Icon: TrendingUp,   cls: "text-green-500" },
    flat: { Icon: Minus,        cls: "text-slate-400" },
  }[trend.direction] || { Icon: Minus, cls: "text-slate-400" };
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
      <div className={`flex items-center gap-0.5 font-bold tabular-nums ${dirMeta.cls}`}>
        <Icon className="w-4 h-4" aria-hidden />
        <span className="text-sm">{trend.latest}{trend.unit ? ` ${trend.unit}` : ""}</span>
        <span aria-hidden>{trendSymbol(trend.direction)}</span>
      </div>
    </div>
  );
}

function ParamTrends({ trends }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
        <TrendingDown className="w-4 h-4" aria-hidden /> Xu hướng thông số
      </h2>
      {trends.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Chưa có thông số nào được ghi</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {trends.map((t, i) => <TrendCard key={`${t.station}-${t.tag}-${i}`} trend={t} />)}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [days, setDays]       = useState(7);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboard(days)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Không tải được dữ liệu thống kê");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" aria-hidden /> Thống kê
        </h1>
        <div className="flex rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                days === d
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700"
              }`}
            >
              {d}n
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {data && !loading && !error && (
        <>
          <div className="flex gap-3">
            <StatCard icon={BarChart3} label="Tổng lượt" value={data.total} />
            <StatCard
              icon={AlertTriangle}
              label="Ngoài phạm vi"
              value={formatPercent(data.geo.out_of_range_rate)}
              tone={data.geo.out_of_range_rate > 0 ? "danger" : "default"}
            />
            <StatCard
              icon={Clock}
              label="Cao điểm"
              value={busiestHour(data.heatmap) != null ? formatHour(busiestHour(data.heatmap)) : "—"}
              tone="info"
            />
          </div>

          <HourHeatmap heatmap={data.heatmap} />
          <GeoBreakdown geo={data.geo} />
          <StationTable stations={data.stations} />
          <ParamTrends trends={data.param_trends} />
        </>
      )}
    </div>
  );
}
