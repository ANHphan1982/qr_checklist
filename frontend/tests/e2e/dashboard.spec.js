import { test, expect } from "@playwright/test";

const ADMIN_KEY = "test-admin-secret";

const MOCK_STATIONS = [
  { name: "CONG-A", lat: 10.7769, lng: 106.7009, radius: 300, active: true },
  { name: "CONG-B", lat: 10.7800, lng: 106.7050, radius: 200, active: true },
];

// Heatmap 24 giờ: cao điểm 8h (10 lượt)
const MOCK_HEATMAP = Array.from({ length: 24 }, (_, h) => (h === 8 ? 10 : h === 9 ? 5 : 0));

const MOCK_DASHBOARD = {
  total: 42,
  heatmap: MOCK_HEATMAP,
  geo: {
    counts: { ok: 30, out_of_range: 6, no_gps: 6 },
    total: 42,
    out_of_range_rate: 6 / 42,
  },
  stations: [
    { station: "CONG-A", total: 30, out_of_range: 6, last_scan: "2026-08-17T01:30:00+00:00" },
    { station: "CONG-B", total: 12, out_of_range: 0, last_scan: "2026-08-16T13:00:00+00:00" },
  ],
  param_trends: [
    {
      station: "CONG-A", tag: "052-LI-066B", label: "Mức dầu", unit: "mm",
      points: [
        { scanned_at: "2026-08-15T01:00:00+00:00", value: 120 },
        { scanned_at: "2026-08-16T01:00:00+00:00", value: 100 },
        { scanned_at: "2026-08-17T01:00:00+00:00", value: 90 },
      ],
      direction: "down", breaches: 1, latest: 90,
    },
  ],
};

const EMPTY_DASHBOARD = {
  total: 0,
  heatmap: Array(24).fill(0),
  geo: { counts: {}, total: 0, out_of_range_rate: 0 },
  stations: [],
  param_trends: [],
};

/** Mock các API admin cần cho loadAll sau login. */
async function mockAdminApi(page) {
  await page.route("**/api/admin/stations**", async (r) => {
    const key = r.request().headers()["x-admin-key"];
    if (key !== ADMIN_KEY) {
      return r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_STATIONS) });
  });
  await page.route("**/api/admin/qr-aliases**", async (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
  await page.route("**/api/admin/station-params**", async (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );
}

/** Mock /api/dashboard. handler(route) tùy biến; mặc định trả MOCK_DASHBOARD. */
async function mockDashboard(page, handler) {
  await page.route("**/api/dashboard**", async (r) => {
    if (handler) return handler(r);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DASHBOARD) });
  });
}

/** Login admin rồi mở tab Thống kê. */
async function openDashboardTab(page, key = ADMIN_KEY) {
  await page.goto("/admin");
  await page.waitForSelector("input[type='password']");
  await page.fill("input[type='password']", key);
  await page.locator("button[type='submit']").click();
  await expect(page.locator("button:has-text('Đăng xuất')")).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: /Thống kê/ }).click();
}

// ────────────────────────────────────────────────────────────────────────────
test.describe("Dashboard (tab Thống kê) — dữ liệu bình thường", () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page);
    await mockDashboard(page);
    await openDashboardTab(page);
  });

  test("hiển thị 3 stat card với giá trị đúng", async ({ page }) => {
    await expect(page.getByText("Tổng lượt")).toBeVisible();
    await expect(page.getByText("42", { exact: true })).toBeVisible();
    // 6/42 ≈ 14% ngoài phạm vi + số lượt tuyệt đối
    await expect(page.getByText("14%", { exact: true })).toBeVisible();
    await expect(page.getByText("6 lượt", { exact: true })).toBeVisible();
    // Cao điểm 08:00 (stat card + caption heatmap)
    await expect(page.getByText("08:00").first()).toBeVisible();
  });

  test("hiển thị đủ 4 section thống kê", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Giờ quét trong ngày/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Chất lượng vị trí GPS/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Hoạt động theo trạm/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Xu hướng thông số/ })).toBeVisible();
  });

  test("geo breakdown hiện nhãn kèm số lượt và phần trăm", async ({ page }) => {
    await expect(page.getByText("Đúng vị trí")).toBeVisible();
    await expect(page.getByText("Ngoài phạm vi").last()).toBeVisible();
    await expect(page.getByText("Không GPS")).toBeVisible();
    // 30/42 ≈ 71%
    await expect(page.getByText(/30\s*·\s*71%/)).toBeVisible();
  });

  test("bảng trạm hiện tên, tổng lượt và badge ngoài phạm vi", async ({ page }) => {
    const stationSection = page.locator("section", { hasText: "Hoạt động theo trạm" });
    await expect(stationSection.getByText("CONG-A", { exact: true })).toBeVisible();
    await expect(stationSection.getByText("CONG-B", { exact: true })).toBeVisible();
    await expect(stationSection.getByText("30", { exact: true })).toBeVisible();
    await expect(stationSection.getByText("12", { exact: true })).toBeVisible();
    // Badge cảnh báo out_of_range của CONG-A có aria-label rõ nghĩa
    await expect(page.getByLabel("6 lượt ngoài phạm vi")).toBeVisible();
  });

  test("xu hướng thông số hiện tag, số mẫu, breach và giá trị mới nhất", async ({ page }) => {
    await expect(page.getByText("052-LI-066B")).toBeVisible();
    await expect(page.getByText("Mức dầu")).toBeVisible();
    await expect(page.getByText(/3 mẫu/)).toBeVisible();
    await expect(page.getByText(/1 vượt ngưỡng/)).toBeVisible();
    await expect(page.getByText(/90 mm/)).toBeVisible();
  });

  test("hiện thời điểm cập nhật sau khi tải xong", async ({ page }) => {
    await expect(page.getByText(/Cập nhật lúc \d{2}:\d{2}/)).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────────────────────
test.describe("Dashboard — chọn khoảng thời gian", () => {
  test("mặc định 7 ngày, chuyển 30 ngày gọi API days=30 và cập nhật aria-pressed", async ({ page }) => {
    await mockAdminApi(page);
    const requestedDays = [];
    await mockDashboard(page, (r) => {
      const url = new URL(r.request().url());
      requestedDays.push(url.searchParams.get("days"));
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DASHBOARD) });
    });
    await openDashboardTab(page);

    const btn7 = page.getByRole("button", { name: "7 ngày" });
    const btn30 = page.getByRole("button", { name: "30 ngày" });
    await expect(btn7).toHaveAttribute("aria-pressed", "true");
    await expect(btn30).toHaveAttribute("aria-pressed", "false");

    await btn30.click();
    await expect(btn30).toHaveAttribute("aria-pressed", "true");
    await expect(btn7).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/trong 30 ngày/)).toBeVisible();
    await expect.poll(() => requestedDays).toContain("30");
  });
});

// ────────────────────────────────────────────────────────────────────────────
test.describe("Dashboard — loading / error / empty", () => {
  test("hiện skeleton khi đang tải rồi thay bằng dữ liệu", async ({ page }) => {
    await mockAdminApi(page);
    await mockDashboard(page, async (r) => {
      await new Promise((res) => setTimeout(res, 700));
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DASHBOARD) });
    });
    await openDashboardTab(page);

    const skeleton = page.getByRole("status", { name: "Đang tải dữ liệu thống kê" });
    await expect(skeleton).toBeVisible();
    await expect(page.getByText("Tổng lượt")).toBeVisible({ timeout: 5_000 });
    await expect(skeleton).toHaveCount(0);
  });

  test("lỗi API hiện thông báo + nút Thử lại; bấm Thử lại tải lại thành công", async ({ page }) => {
    await mockAdminApi(page);
    // Cờ thay vì đếm call: StrictMode (dev) mount effect 2 lần nên số call không ổn định
    let failMode = true;
    await mockDashboard(page, (r) => {
      if (failMode) {
        return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Lỗi server" }) });
      }
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DASHBOARD) });
    });
    await openDashboardTab(page);

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Lỗi server");

    failMode = false;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Tổng lượt")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("không có lượt quét nào → hiện empty state gợi ý thay vì section rỗng", async ({ page }) => {
    await mockAdminApi(page);
    await mockDashboard(page, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EMPTY_DASHBOARD) })
    );
    await openDashboardTab(page);

    await expect(page.getByText(/Chưa có lượt quét nào trong 7 ngày qua/)).toBeVisible();
    await expect(page.getByText(/chọn khoảng thời gian dài hơn/)).toBeVisible();
    // Không render các section chart khi hoàn toàn trống
    await expect(page.getByRole("heading", { name: /Giờ quét trong ngày/ })).toHaveCount(0);
  });

  test("nút Tải lại gọi API lần nữa", async ({ page }) => {
    await mockAdminApi(page);
    let calls = 0;
    await mockDashboard(page, (r) => {
      calls++;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DASHBOARD) });
    });
    await openDashboardTab(page);
    await expect(page.getByText("Tổng lượt")).toBeVisible();
    const before = calls;

    await page.getByRole("button", { name: "Tải lại thống kê" }).click();
    await expect.poll(() => calls).toBeGreaterThan(before);
    await expect(page.getByText("Tổng lượt")).toBeVisible();
  });
});
