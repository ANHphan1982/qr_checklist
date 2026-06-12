import { test, expect } from "@playwright/test";

/**
 * E2E cho trang Lịch sử — kiểm chứng lợi ích của retention 30 ngày (#1):
 * người dùng xem được dữ liệu của NGÀY CŨ. Trước đây auto-purge 24h khiến chọn
 * ngày quá khứ luôn rỗng; nay backend giữ data 30 ngày nên trang truy vấn được.
 *
 * API được mock theo tham số ?date — trả dữ liệu cho ngày quá khứ, rỗng cho hôm nay.
 */

/** Format YYYY-MM-DD (khớp value của input[type=date]). */
function ymd(d) {
  return d.toLocaleDateString("en-CA");
}

/** Mock /api/station-params (fetch khi mount) + /api/reports theo ?date. */
async function mockHistoryApi(page, pastDate) {
  await page.route("**/api/station-params**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configs: [] }) })
  );
  await page.route("**/api/reports**", (r) => {
    const date = new URL(r.request().url()).searchParams.get("date");
    if (date === pastDate) {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          date: pastDate,
          total: 1,
          logs: [
            {
              id: 501,
              location: "TRAM-LICH-SU-CU",
              device_id: "dev-old",
              scanned_at: `${pastDate}T02:00:00+00:00`,
              geo_status: "no_gps",
              email_sent: true,
              param_values: [],
            },
          ],
        }),
      });
    }
    // Mọi ngày khác (gồm hôm nay) → rỗng
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ date, total: 0, logs: [] }),
    });
  });
}

test.describe("Trang Lịch sử — xem dữ liệu ngày quá khứ (retention 30 ngày)", () => {
  test("mặc định mở vào hôm nay và hiển thị trạng thái rỗng", async ({ page }) => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    await mockHistoryApi(page, ymd(past));

    await page.goto("/history");

    await expect(page.getByRole("heading", { name: /lịch sử/i })).toBeVisible();
    await expect(page.getByText(/Chưa có lượt check-in/)).toBeVisible({ timeout: 5_000 });
  });

  test("chọn ngày 10 ngày trước → tự fetch và hiển thị log của ngày cũ", async ({ page }) => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const pastStr = ymd(past);
    await mockHistoryApi(page, pastStr);

    await page.goto("/history");
    // Hôm nay rỗng
    await expect(page.getByText(/Chưa có lượt check-in/)).toBeVisible({ timeout: 5_000 });

    // Đổi ngày là tự fetch — nút "Tải" đã bỏ
    await page.fill("#date-picker", pastStr);

    // Log của ngày cũ phải hiển thị — bằng chứng dữ liệu KHÔNG bị purge sau 24h
    await expect(page.getByText("TRAM-LICH-SU-CU")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("1 lượt")).toBeVisible();
  });

  test("request /api/reports mang đúng tham số date của ngày quá khứ", async ({ page }) => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    const pastStr = ymd(past);
    await mockHistoryApi(page, pastStr);

    await page.goto("/history");
    await expect(page.getByText(/Chưa có lượt check-in/)).toBeVisible({ timeout: 5_000 });

    const reqPromise = page.waitForRequest(
      (req) => req.url().includes("/api/reports") && req.url().includes(`date=${pastStr}`)
    );
    await page.fill("#date-picker", pastStr); // đổi ngày là tự fetch
    await reqPromise; // sẽ timeout nếu date không được truyền đúng
  });
});
