import { useState } from "react";
import { Lock } from "lucide-react";
import { api, SESSION_KEY, INPUT_CLS } from "./adminApi";

export default function LoginGate({ onLogin }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await api(key).get("/api/admin/stations");
      sessionStorage.setItem(SESSION_KEY, key);
      onLogin(key);
    } catch {
      setErr("Sai mật khẩu admin hoặc server lỗi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Lock className="w-5 h-5" aria-hidden />
          Admin QR Checklist
        </h1>
        <input
          type="password"
          placeholder="Nhập mật khẩu admin"
          value={key}
          onChange={e => setKey(e.target.value)}
          className={`${INPUT_CLS} mt-0`}
          autoFocus
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={loading || !key}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 min-h-[48px]"
        >
          {loading ? "Đang kiểm tra..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
