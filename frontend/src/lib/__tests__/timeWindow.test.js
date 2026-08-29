import { describe, it, expect } from "vitest";
import { vnDateKey, hasWindowRolledOver } from "../timeWindow.js";

// Helper: instant UTC ứng với giờ tường VN (UTC+7).
const vn = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 7 * 60 * 60000;

describe("vnDateKey", () => {
  it("trả ngày theo giờ tường VN, không theo UTC", () => {
    // 00:30 VN ngày 12 = 17:30 UTC ngày 11 → phải ra ngày 12
    expect(vnDateKey(vn(2026, 6, 12, 0, 30))).toBe("2026-06-12");
  });

  it("23:59 VN vẫn thuộc ngày đó", () => {
    expect(vnDateKey(vn(2026, 6, 12, 23, 59))).toBe("2026-06-12");
  });
});

describe("hasWindowRolledOver", () => {
  it("cùng ca, cách nhau vài phút → false", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 12, 8), vn(2026, 6, 12, 8, 45))).toBe(false);
  });

  it("vượt mốc 18:00 (ca ngày → ca đêm) → true", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 12, 17, 50), vn(2026, 6, 12, 18, 10))).toBe(true);
  });

  it("vượt mốc 06:00 (ca đêm → ca ngày) → true", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 12, 5, 50), vn(2026, 6, 12, 6, 10))).toBe(true);
  });

  it("qua nửa đêm nhưng vẫn trong ca đêm → true (đổi ngày VN, chu kỳ ngày/tháng đổi)", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 12, 23, 50), vn(2026, 6, 13, 0, 10))).toBe(true);
  });

  it("qua mốc sang tháng mới → true", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 30, 23, 50), vn(2026, 7, 1, 0, 10))).toBe(true);
  });

  it("thời gian lùi về quá khứ (đồng hồ máy nhảy) → false, không refetch loạn", () => {
    expect(hasWindowRolledOver(vn(2026, 6, 12, 20), vn(2026, 6, 12, 8))).toBe(false);
  });

  it("hai mốc bằng nhau → false", () => {
    const t = vn(2026, 6, 12, 8);
    expect(hasWindowRolledOver(t, t)).toBe(false);
  });

  it("đầu vào không hợp lệ → false (không crash)", () => {
    expect(hasWindowRolledOver(NaN, Date.now())).toBe(false);
    expect(hasWindowRolledOver(undefined, Date.now())).toBe(false);
    expect(hasWindowRolledOver(Date.now(), null)).toBe(false);
  });
});
