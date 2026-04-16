import { BrowserRouter, Routes, Route, NavLink, useParams } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";
import StationDisplayPage from "./pages/StationDisplayPage";

function NavBar() {
  const base = "px-5 py-2.5 rounded-lg text-base font-medium transition-colors";
  const active = `${base} bg-blue-600 text-white`;
  const inactive = `${base} text-slate-600 hover:bg-slate-100`;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-slate-800">QR Checklist</span>
        <div className="flex gap-2">
          <NavLink to="/" end className={({ isActive }) => (isActive ? active : inactive)}>
            Scan
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => (isActive ? active : inactive)}>
            Lịch sử
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

// Wrapper để lấy :name từ URL params
function StationDisplayRoute() {
  const { name } = useParams();
  return <StationDisplayPage stationName={decodeURIComponent(name)} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Trang màn hình trạm — fullscreen, không có NavBar */}
        <Route path="/station/:name" element={<StationDisplayRoute />} />

        {/* Trang nhân viên — có NavBar */}
        <Route
          path="/*"
          element={
            <div className="min-h-[100dvh] flex flex-col">
              <NavBar />
              <main className="flex-1 max-w-2xl mx-auto w-full px-3 py-4 overflow-y-auto">
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
