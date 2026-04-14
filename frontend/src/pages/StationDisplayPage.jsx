/**
 * Trang hiển thị Rotating QR cho màn hình tại trạm.
 *
 * Cách dùng:
 *   Mở trên tablet/TV/màn hình đặt tại trạm:
 *   https://your-app.vercel.app/station/TK-5201A
 *
 * Tính năng:
 *   - Tự fetch QR content từ backend mỗi lần token sắp hết hạn
 *   - Hiển thị QR bằng thư viện qrcode.react (SVG, không cần camera)
 *   - Đếm ngược thời gian đến lần đổi QR tiếp theo
 *   - Fullscreen, không cần đăng nhập
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 10000,
});

// Vẽ QR bằng canvas thuần — không cần thư viện thêm
// Dùng endpoint /api/qr-token/:station để lấy qr_content, rồi render bằng thẻ <img> từ API QR
// Hoặc dùng Google Charts API (offline fallback)
function QRImage({ content, size = 300 }) {
  // Dùng QR Server API để render (miễn phí, không cần thêm package)
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(content)}&size=${size}x${size}&ecc=H`;
  return (
    <img
      src={url}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-lg shadow-lg"
    />
  );
}

function CountdownBar({ expiresIn, total }) {
  const pct = Math.max(0, Math.min(100, (expiresIn / total) * 100));
  const color = pct > 40 ? "bg-green-500" : pct > 15 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-slate-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-1000 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function StationDisplayPage({ stationName }) {
  const [qrContent, setQrContent] = useState(null);
  const [expiresIn, setExpiresIn] = useState(300);
  const [windowSeconds, setWindowSeconds] = useState(300);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchToken = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/qr-token/${encodeURIComponent(stationName)}`);
      setQrContent(data.qr_content);
      setExpiresIn(data.expires_in);
      setWindowSeconds(data.window_seconds);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError("Không kết nối được server. Kiểm tra mạng.");
    }
  }, [stationName]);

  // Fetch lần đầu
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Đếm ngược mỗi giây
  useEffect(() => {
    const tick = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          // Token hết hạn — fetch mới
          fetchToken();
          return windowSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchToken, windowSeconds]);

  const mins = Math.floor(expiresIn / 60);
  const secs = expiresIn % 60;

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <p className="text-4xl">⚠️</p>
          <p className="text-xl">{error}</p>
          <button
            onClick={fetchToken}
            className="px-6 py-2 bg-blue-600 rounded-lg text-white"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 p-6 select-none">

      {/* Tên trạm */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white tracking-wide">{stationName}</h1>
        <p className="text-slate-400 mt-2 text-lg">Scan để check-in</p>
      </div>

      {/* QR Code */}
      <div className="bg-white p-6 rounded-2xl shadow-2xl">
        {qrContent ? (
          <QRImage content={qrContent} size={280} />
        ) : (
          <div className="w-[280px] h-[280px] flex items-center justify-center bg-slate-100 rounded-lg">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Countdown */}
      <div className="w-full max-w-sm space-y-2">
        <CountdownBar expiresIn={expiresIn} total={windowSeconds} />
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Mã đổi sau</span>
          <span className={`font-mono font-bold ${expiresIn <= 30 ? "text-red-400" : "text-white"}`}>
            {mins}:{String(secs).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Footer */}
      {lastUpdated && (
        <p className="text-slate-600 text-xs">
          Cập nhật lúc {lastUpdated.toLocaleTimeString("vi-VN")}
        </p>
      )}
    </div>
  );
}
