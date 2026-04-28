import { useState, useCallback } from "react";
import { checkConnectivity } from "../lib/api";
import { probeGps, STATUS } from "../lib/mdmProbes";
import { probeCamera } from "../lib/cameraProbe";

// ---------------------------------------------------------------------------
// MDM Diagnostic Page — /mdm-check
// Dành cho IT Admin chạy trực tiếp trên thiết bị MDM để xác định nguyên nhân lỗi.
// Kiểm tra 5 nhóm: HTTPS, Network, Camera, GPS, Offline Storage.
// Logic GPS probe tách ra lib/mdmProbes.js để test được.
// ---------------------------------------------------------------------------


function useChecks() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);

  const set = (id, status, detail = "") =>
    setResults((r) => ({ ...r, [id]: { status, detail } }));

  const run = useCallback(async () => {
    setRunning(true);
    setResults({});

    // 1. HTTPS
    const isHttps = location.protocol === "https:";
    set(
      "https",
      isHttps ? STATUS.PASS : STATUS.FAIL,
      isHttps
        ? `Đang dùng HTTPS — camera API hoạt động bình thường`
        : `Đang dùng HTTP — camera API bị trình duyệt chặn. Yêu cầu MDM cho phép HTTPS đến domain này`
    );

    // 2. Backend connectivity
    // Phân biệt 3 trạng thái:
    //  - PASS : server OK
    //  - WARN : thiết bị offline (airplane mode / mất mạng) — KHÔNG phải lỗi MDM,
    //           app có offline queue xử lý tiếp, không cần IT can thiệp
    //  - FAIL : online nhưng gọi backend fail → nghi ngờ CORS/firewall/SSL
    set("network", STATUS.RUNNING, "Đang kết nối...");
    try {
      const { ok, offline, detail } = await checkConnectivity();
      let nextStatus;
      let nextDetail;
      if (ok) {
        nextStatus = STATUS.PASS;
        nextDetail = detail;
      } else if (offline) {
        nextStatus = STATUS.WARN;
        nextDetail =
          `${detail}. ` +
          `App vẫn hoạt động offline — scan sẽ lưu vào queue và tự đồng bộ khi có mạng`;
      } else {
        nextStatus = STATUS.FAIL;
        nextDetail =
          `Không thể kết nối backend — ${detail}. ` +
          `Kiểm tra Web Content Filter trong MDM: cho phép domain backend`;
      }
      set("network", nextStatus, nextDetail);
    } catch (e) {
      const msg = e?.message || "unknown";
      const isCert = msg.includes("certificate") || msg.includes("ssl") || msg.includes("SSL");
      set(
        "network",
        STATUS.FAIL,
        isCert
          ? `Lỗi SSL Certificate — MDM đang bật SSL Inspection. ` +
            `Cần thêm domain backend vào danh sách SSL Inspection Bypass`
          : `Lỗi kết nối: ${msg}`
      );
    }

    // 3. Camera
    set("camera", STATUS.RUNNING, "Đang xin quyền camera...");
    const camReport = await probeCamera();
    set("camera", camReport.status, camReport.detail);

    // 4. GPS — probe chi tiết để xác định đúng nguyên nhân
    set("gps", STATUS.RUNNING, "Đang chẩn đoán GPS...");
    const gpsReport = await probeGps();
    set(
      "gps",
      gpsReport.status,
      gpsReport.detail
    );

    // 5. LocalStorage (offline queue)
    try {
      const key = "__mdm_test__";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      set("storage", STATUS.PASS, "LocalStorage hoạt động — offline queue khả dụng");
    } catch {
      set(
        "storage",
        STATUS.FAIL,
        `LocalStorage bị chặn — offline queue không hoạt động. ` +
          `MDM Browser Policy có thể đang tắt cookies/storage. Cho phép site data cho domain này`
      );
    }

    setRunning(false);
  }, []);

  return { results, running, run };
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

const CHECKS = [
  { id: "https",   label: "HTTPS",              icon: "🔒" },
  { id: "network", label: "Kết nối Backend",    icon: "🌐" },
  { id: "camera",  label: "Quyền Camera",       icon: "📷" },
  { id: "gps",     label: "Quyền GPS",          icon: "📍" },
  { id: "storage", label: "Offline Storage",    icon: "💾" },
];

function StatusBadge({ status }) {
  const map = {
    [STATUS.IDLE]:    { text: "—",         cls: "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400" },
    [STATUS.RUNNING]: { text: "Đang test…", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse" },
    [STATUS.PASS]:    { text: "✓ OK",       cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
    [STATUS.FAIL]:    { text: "✕ LỖI",      cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    [STATUS.WARN]:    { text: "⚠ CẢNH BÁO", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  };
  const { text, cls } = map[status] || map[STATUS.IDLE];
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

function CheckRow({ icon, label, result }) {
  const status = result?.status || STATUS.IDLE;
  const detail = result?.detail || "";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xl w-8 flex-shrink-0 text-center">{icon}</span>
        <span className="flex-1 font-semibold text-[14px] text-slate-800 dark:text-slate-200 leading-snug">
          {label}
        </span>
        <StatusBadge status={status} />
      </div>
      {detail && (
        <p className="mt-2 ml-10 text-[12px] text-slate-500 dark:text-slate-400 leading-snug whitespace-pre-wrap break-words">
          {detail}
        </p>
      )}
    </div>
  );
}

function SummaryBox({ results }) {
  const vals = Object.values(results);
  if (vals.length === 0) return null;
  const fails = vals.filter((r) => r.status === STATUS.FAIL).length;
  const warns = vals.filter((r) => r.status === STATUS.WARN).length;

  const lines = [
    `=== MDM Diagnostic Report ===`,
    `URL: ${location.href}`,
    `Thời gian: ${new Date().toLocaleString("vi-VN")}`,
    `UA: ${navigator.userAgent}`,
    ``,
    ...CHECKS.map((c) => {
      const r = results[c.id];
      if (!r) return `[?] ${c.label}`;
      const tag = r.status === STATUS.PASS ? "[OK]" : r.status === STATUS.WARN ? "[WARN]" : "[FAIL]";
      return `${tag} ${c.label}: ${r.detail}`;
    }),
  ].join("\n");

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[13px] text-slate-700 dark:text-slate-300">
          Tóm tắt {fails > 0 && <span className="text-red-600">· {fails} lỗi</span>}
          {warns > 0 && <span className="text-yellow-600"> · {warns} cảnh báo</span>}
          {fails === 0 && warns === 0 && <span className="text-green-600"> · Tất cả OK</span>}
        </span>
        <button
          onClick={() => navigator.clipboard?.writeText(lines)}
          className="text-[11px] px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-300 transition-colors"
        >
          Copy
        </button>
      </div>
      <pre className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-all leading-relaxed font-mono">
        {lines}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MDM Reference Card
// ---------------------------------------------------------------------------
function RefCard({ title, items }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <div className="font-bold text-[13px] text-slate-700 dark:text-slate-300 mb-2">{title}</div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[12px] text-slate-600 dark:text-slate-400 flex gap-2">
            <span className="text-blue-500 flex-shrink-0">›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MdmCheckPage() {
  const { results, running, run } = useChecks();
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="space-y-3 pb-4">
      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
        <div className="font-bold text-[14px] text-blue-800 dark:text-blue-200 mb-1">
          🛠 MDM Compatibility Check
        </div>
        <p className="text-[12px] text-blue-700 dark:text-blue-300">
          Chạy trên thiết bị MDM để xác định nguyên nhân app QR Checklist không hoạt động.
          Gửi kết quả cho IT Admin để cấu hình policy phù hợp.
        </p>
      </div>

      <button
        onClick={run}
        disabled={running}
        className={[
          "w-full py-3 rounded-xl font-bold text-[15px] transition-colors",
          running
            ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"
            : "bg-blue-600 text-white active:bg-blue-700",
        ].join(" ")}
      >
        {running ? "Đang kiểm tra…" : hasResults ? "Chạy lại" : "Bắt đầu kiểm tra"}
      </button>

      <div className="space-y-2">
        {CHECKS.map((c) => (
          <CheckRow key={c.id} icon={c.icon} label={c.label} result={results[c.id]} />
        ))}
      </div>

      {hasResults && !running && <SummaryBox results={results} />}

      <div className="pt-2 space-y-2">
        <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
          Hướng dẫn cho IT Admin (ManageEngine MDM Plus)
        </div>

        <RefCard
          title="🔒 Web Content Filter — Allowlist"
          items={[
            "MDM Console → Profile & Policies → Web Content Filter",
            `Thêm domain: ${location.hostname}`,
            "Thêm domain backend API (hỏi dev để có URL chính xác)",
            "Áp dụng policy cho group thiết bị nhân viên",
          ]}
        />

        <RefCard
          title="🌐 VPN Split Tunneling"
          items={[
            "MDM Console → Profile & Policies → VPN",
            "Bật Split Tunneling",
            "Thêm domain app và backend vào Exclude list",
            "Lý do: camera PWA cần HTTPS trực tiếp, không qua VPN proxy",
          ]}
        />

        <RefCard
          title="🔐 SSL Inspection Bypass"
          items={[
            "MDM Console → Network → SSL Inspection",
            "Thêm domain app vào Bypass/Exclusion list",
            "Lý do: SSL Inspection phá vỡ camera API (getUserMedia yêu cầu cert gốc)",
            "Bắt buộc nếu test Camera trên thấy trạng thái LỖI",
          ]}
        />

        <RefCard
          title="📷 Camera & Location Policy"
          items={[
            "MDM Console → Profile & Policies → Restrictions",
            "Device Functionality → Allow Camera: BẬT",
            "Location Services → Allow: BẬT (tùy chọn, cần cho GPS check-in)",
            "Browser Settings → Allow Camera Permission cho domain app",
          ]}
        />
      </div>
    </div>
  );
}
