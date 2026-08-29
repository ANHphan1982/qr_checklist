// useLiveNow — mốc thời gian "đóng băng" nhưng tự làm mới khi sang ca / sang ngày.
//
// Trang chủ và trang scan cần một mốc `now` ổn định để ca, chu kỳ và coverage
// tính nhất quán trong cùng một lần render. Nhưng giữ mốc đó vĩnh viễn thì app
// dán trên máy trực ca sẽ hiển thị ca cũ sau 18:00 / nửa đêm (xem lib/timeWindow).
//
// Hook trả về mốc hiện tại và chỉ đổi giá trị khi thực sự vượt ranh giới ca hoặc
// ngày VN — cùng ca thì setState trả về `prev`, React bail-out, không re-render.
//
// Ba nguồn kích hoạt kiểm tra:
//   • interval 60s      — app mở liên tục qua mốc giao ca
//   • visibilitychange  — mở lại app sau khi để nền (case phổ biến nhất)
//   • focus             — quay lại tab trên trình duyệt desktop

import { useEffect, useState } from "react";
import { hasWindowRolledOver } from "../lib/timeWindow";

export const LIVE_NOW_CHECK_MS = 60000;

export function useLiveNow() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const check = () =>
      setNow((prev) => (hasWindowRolledOver(prev, Date.now()) ? Date.now() : prev));

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    const id = setInterval(check, LIVE_NOW_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return now;
}
