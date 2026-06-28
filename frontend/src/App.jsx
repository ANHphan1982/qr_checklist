import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, useParams } from "react-router-dom";
import { Sun, Moon, Home, History, Smartphone, X } from "lucide-react";
import HomePage from "./pages/HomePage";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import StationDisplayPage from "./pages/StationDisplayPage";
import AdminPage from "./pages/AdminPage";
import MdmCheckPage from "./pages/MdmCheckPage";
import { ToastProvider } from "./components/ui/Toast";

// ---------------------------------------------------------------------------
// PWA display mode hook — thêm class pwa-mode lên <html> khi chạy standalone
// Xử lý iOS Safari (navigator.standalone) mà CSS media query không detect được
// ---------------------------------------------------------------------------
function useDisplayMode() {
  useEffect(() => {
    // Initial state đã được set bởi inline script trong index.html (chạy trước React).
    // Hook này chỉ cần sync lại khi display-mode thay đổi runtime (hiếm gặp).
    const mq = window.matchMedia("(display-mode: standalone)");
    const apply = (isStandalone) => {
      document.documentElement.classList.toggle("pwa-mode", isStandalone);
      document.documentElement.style.fontSize = isStandalone ? "20px" : "";
    };
    const handler = (e) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
}

// ---------------------------------------------------------------------------
// Dark mode hook
// ---------------------------------------------------------------------------
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark];
}

// ---------------------------------------------------------------------------
// PWA Install Prompt
// ---------------------------------------------------------------------------
function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  return { canInstall: !!prompt, install };
}

// ---------------------------------------------------------------------------
// Install Banner
// ---------------------------------------------------------------------------
function InstallBanner({ onInstall, onDismiss }) {
  return (
    <div className="mx-3 mt-3 rounded-2xl bg-blue-600 text-white px-4 py-3 flex items-center gap-3">
      <Smartphone className="w-7 h-7 flex-shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-bold leading-tight">Cài đặt app</div>
        <div className="text-[13px] text-blue-100 leading-tight mt-0.5">
          Dùng nhanh, hỗ trợ offline
        </div>
      </div>
      <button
        onClick={onInstall}
        className="min-h-[40px] px-4 bg-white text-blue-700 rounded-xl text-[14px] font-bold active:bg-blue-50 transition-colors flex-shrink-0"
      >
        Cài đặt
      </button>
      <button
        onClick={onDismiss}
        aria-label="Bỏ qua"
        className="w-10 h-10 rounded-xl bg-blue-700/60 text-white flex items-center justify-center active:bg-blue-700/80 transition-colors flex-shrink-0"
      >
        <X className="w-5 h-5" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavBar — logo trái + dark toggle phải; điều hướng chuyển xuống BottomTabs
// ---------------------------------------------------------------------------
function NavBar({ dark, onToggleDark }) {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <div className="px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-[18px] text-slate-900 dark:text-slate-100 tracking-tight">
          QR Checklist
        </span>
        <button
          onClick={onToggleDark}
          aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
          className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-600 flex items-center justify-center transition-colors"
        >
          {dark ? <Moon className="w-5 h-5" aria-hidden /> : <Sun className="w-5 h-5" aria-hidden />}
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab bar — thumb-zone, hit target 64px, label luôn hiện
// ---------------------------------------------------------------------------
function BottomTabs() {
  const tabClass = ({ isActive }) =>
    [
      "flex-1 min-h-[76px] flex flex-col items-center justify-center gap-1.5 transition-colors select-none",
      "text-[15px] font-bold tracking-tight",
      isActive
        ? "text-blue-600 dark:text-blue-400"
        : "text-slate-500 dark:text-slate-400 active:text-slate-700 dark:active:text-slate-200",
    ].join(" ");

  return (
    <nav
      aria-label="tab navigation"
      className="sticky bottom-0 z-40 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        <NavLink to="/" end className={tabClass}>
          {({ isActive }) => (
            <>
              <div className={[
                "tab-pill w-16 h-10 rounded-full flex items-center justify-center transition-colors",
                isActive ? "bg-blue-100 dark:bg-blue-500/20" : "",
              ].join(" ")}>
                <Home className="tab-icon w-7 h-7" aria-hidden />
              </div>
              <span>Trang chủ</span>
            </>
          )}
        </NavLink>
        <NavLink to="/history" className={tabClass}>
          {({ isActive }) => (
            <>
              <div className={[
                "w-16 h-10 rounded-full flex items-center justify-center transition-colors",
                isActive ? "bg-blue-100 dark:bg-blue-500/20" : "",
              ].join(" ")}>
                <History className="w-7 h-7" aria-hidden />
              </div>
              <span>Lịch sử</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// PWA Debug Badge — tap logo 5 lần để bật, tap badge để tắt
// Hiển thị toàn bộ detection values để kiểm tra trên điện thoại
// ---------------------------------------------------------------------------
function PWADebugBadge() {
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState(null);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    if (!show) return;
    const html = document.documentElement;
    const computed = getComputedStyle(html).fontSize;
    setInfo({
      matchMedia: window.matchMedia("(display-mode: standalone)").matches,
      navStandalone: window.navigator.standalone,
      hasPwaMode: html.classList.contains("pwa-mode"),
      inlineSize: html.style.fontSize || "(none)",
      computedSize: computed,
      userAgent: navigator.userAgent.slice(0, 60),
    });
  }, [show]);

  const handleTap = () => {
    const next = tapCount + 1;
    if (next >= 5) {
      setShow((s) => !s);
      setTapCount(0);
    } else {
      setTapCount(next);
      // reset counter nếu không tap tiếp trong 2 giây
      setTimeout(() => setTapCount(0), 2000);
    }
  };

  return (
    <>
      {/* Invisible tap zone góc trên TRÁI (trên logo) — tap 5 lần để bật debug */}
      <button
        onClick={handleTap}
        className="fixed top-0 left-0 w-16 h-16 z-[9999] opacity-0"
        aria-label="Toggle debug"
      />
      {show && info && (
        <div
          className="fixed inset-x-3 top-20 z-[9999] rounded-2xl bg-slate-900 text-white text-[12px] font-mono p-4 shadow-2xl"
          onClick={() => setShow(false)}
        >
          <div className="font-bold text-yellow-400 mb-2 text-[13px]">🔍 PWA Debug (tap để đóng)</div>
          <Row label="display-mode:standalone" value={String(info.matchMedia)} ok={info.matchMedia} />
          <Row label="navigator.standalone" value={String(info.navStandalone)} ok={info.navStandalone} />
          <Row label="html.pwa-mode class" value={info.hasPwaMode ? "✅ có" : "❌ không"} ok={info.hasPwaMode} />
          <Row label="style.fontSize (inline)" value={info.inlineSize} ok={info.inlineSize !== "(none)"} />
          <Row label="fontSize computed" value={info.computedSize} ok={parseFloat(info.computedSize) >= 20} />
          <div className="mt-2 text-slate-400 text-[10px] break-all">{info.userAgent}</div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, ok }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 border-b border-slate-700">
      <span className="text-slate-400">{label}</span>
      <span className={ok ? "text-green-400" : "text-red-400"}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper để lấy :name từ URL params
// ---------------------------------------------------------------------------
function StationDisplayRoute() {
  const { name } = useParams();
  return <StationDisplayPage stationName={decodeURIComponent(name)} />;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  useDisplayMode();
  const [dark, setDark] = useDarkMode();
  const { canInstall, install } = useInstallPrompt();
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem("pwa-dismissed") === "1"
  );

  const handleInstall = async () => {
    await install();
    setBannerDismissed(true);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-dismissed", "1");
    setBannerDismissed(true);
  };

  const showBanner = canInstall && !bannerDismissed;

  return (
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        {/* Trang màn hình trạm — fullscreen, không có chrome */}
        <Route path="/station/:name" element={<StationDisplayRoute />} />

        {/* Trang nhân viên — NavBar trên + BottomTabs dưới */}
        <Route
          path="/*"
          element={
            <div className="min-h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
              <PWADebugBadge />
              <NavBar dark={dark} onToggleDark={() => setDark((d) => !d)} />
              {showBanner && (
                <InstallBanner onInstall={handleInstall} onDismiss={handleDismiss} />
              )}
              <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 pb-24">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/scan/:type" element={<ScanPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/mdm-check" element={<MdmCheckPage />} />
                </Routes>
              </main>
              <BottomTabs />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}
