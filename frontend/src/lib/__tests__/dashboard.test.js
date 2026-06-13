/**
 * TDD — lib/dashboard.js
 * Helper thuần định dạng dữ liệu analytics cho DashboardPage (chart CSS, không lib).
 */
import { describe, it, expect } from "vitest";
import {
  heatmapMax,
  busiestHour,
  formatHour,
  formatPercent,
  trendSymbol,
} from "../dashboard.js";

describe("heatmapMax", () => {
  it("trả 0 cho mảng rỗng", () => {
    expect(heatmapMax([])).toBe(0);
  });

  it("trả 0 khi tất cả bằng 0", () => {
    expect(heatmapMax(new Array(24).fill(0))).toBe(0);
  });

  it("trả giá trị lớn nhất", () => {
    const h = new Array(24).fill(0);
    h[8] = 5;
    h[9] = 3;
    expect(heatmapMax(h)).toBe(5);
  });
});

describe("busiestHour", () => {
  it("trả null khi rỗng", () => {
    expect(busiestHour([])).toBeNull();
  });

  it("trả null khi tất cả bằng 0", () => {
    expect(busiestHour(new Array(24).fill(0))).toBeNull();
  });

  it("trả index giờ có nhiều scan nhất", () => {
    const h = new Array(24).fill(0);
    h[14] = 7;
    expect(busiestHour(h)).toBe(14);
  });

  it("trả index đầu tiên khi hòa", () => {
    const h = new Array(24).fill(0);
    h[6] = 4;
    h[18] = 4;
    expect(busiestHour(h)).toBe(6);
  });
});

describe("formatHour", () => {
  it("định dạng giờ hai chữ số kèm :00", () => {
    expect(formatHour(8)).toBe("08:00");
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(23)).toBe("23:00");
  });
});

describe("formatPercent", () => {
  it("0 → 0%", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("0.25 → 25%", () => {
    expect(formatPercent(0.25)).toBe("25%");
  });

  it("làm tròn không thập phân mặc định", () => {
    expect(formatPercent(0.333)).toBe("33%");
  });

  it("hỗ trợ số thập phân tuỳ chọn", () => {
    expect(formatPercent(0.333, 1)).toBe("33.3%");
  });
});

describe("trendSymbol", () => {
  it("down → ↓", () => {
    expect(trendSymbol("down")).toBe("↓");
  });

  it("up → ↑", () => {
    expect(trendSymbol("up")).toBe("↑");
  });

  it("flat / khác → →", () => {
    expect(trendSymbol("flat")).toBe("→");
    expect(trendSymbol("???")).toBe("→");
  });
});
