import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, useParams } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import StationDisplayPage from "./pages/StationDisplayPage";

// ---------------------------------------------------------------------------
// Dark mode hook — đọc localStorage, fallback về prefers-color-scheme
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
// Sun / Moon icons
// ---------------------------------------------------------------------------
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------
function NavBar({ dark, onToggleDark }) {
  const base   = "px-4 py-2 rounded-lg text-base font-medium transition-colors";
  const active = `${base} bg-blue-600 text-white`;
  const inactive = `${base} text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`;

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="w-full px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-slate-800 dark:text-slate-100">
          QR Checklist
        </span>
        <div className="flex items-center gap-2">
          <NavLink to="/" end className={({ isActive }) => (isActive ? active : inactive)}>
            Scan
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? active : inactive)}>
            Lịch sử
          </NavLink>
          {/* Dark mode toggle */}
          <button
            onClick={onToggleDark}
            aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
            className="ml-1 p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </nav>
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
  const [dark, setDark] = useDarkMode();

  return (
    <BrowserRouter>
      <Routes>
        {/* Trang màn hình trạm — fullscreen, không có NavBar */}
        <Route path="/station/:name" element={<StationDisplayRoute />} />

        {/* Trang nhân viên — có NavBar */}
        <Route
          path="/*"
          element={
            <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900 transition-colors">
              <NavBar dark={dark} onToggleDark={() => setDark((d) => !d)} />
              <main className="w-full px-3 py-4">
                <Routes>
                  <Route path="/" element={<ScanPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                </Routes>
              </main>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
