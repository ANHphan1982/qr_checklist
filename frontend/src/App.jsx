import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import ScanPage from "./pages/ScanPage";
import HistoryPage from "./pages/HistoryPage";

function NavBar() {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-colors";
  const active = `${base} bg-blue-600 text-white`;
  const inactive = `${base} text-slate-600 hover:bg-slate-100`;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-slate-800">QR Checklist</span>
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

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
          <Routes>
            <Route path="/" element={<ScanPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
