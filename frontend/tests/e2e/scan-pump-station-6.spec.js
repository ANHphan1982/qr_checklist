import { test, expect } from "@playwright/test";
import { ScanPagePOM, blockServiceWorker } from "./helpers/scan-page.js";

/**
 * E2E cho trạm PUMP_STATION_6 (bug: scan báo "không có GPS" / không xác thực vị trí).
 *
 * Fix: PUMP_STATION_6 được đưa vào static/builtin config nên:
 *  - QR alias 052-PG-038 resolve về PUMP_STATION_6
 *  - Modal thông số vận hành (8 thông số) hiển thị từ builtin — kể cả khi
 *    /api/station-params không trả dữ liệu (DB ngủ) hoặc thiết bị offline.
 */

/** Mock backend: scan trả về location đã resolve = PUMP_STATION_6, station-params rỗng
 *  để CHỨNG MINH modal lấy từ builtin config (không phụ thuộc DB). */
async function mockBackend(page) {
  await blockServiceWorker(page);
  await page.route("**/health", (r) => r.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        scan_id: 5,
        email_sent: true,
        location: "PUMP_STATION_6",
      }),
    })
  );
  // DB "ngủ" → endpoint trả danh sách rỗng. Builtin phải gánh.
  await page.route("**/api/station-params", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configs: [] }) })
  );
  await page.route("**/api/reports**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ date: "2026-04-18", total: 0, logs: [] }) })
  );
}

test.describe("PUMP_STATION_6 scan flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("scan QR alias 052-PG-038 → mở modal 8 thông số từ builtin config", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    await sp.startAndScan("052-PG-038");

    // Modal thông số vận hành xuất hiện cho PUMP_STATION_6 (resolve từ alias)
    const modal = page.locator(".fixed.inset-0.z-50");
    await expect(modal.locator("text=Thông số vận hành")).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText("PUMP_STATION_6")).toBeVisible();
    await expect(modal.locator("text=/8 thông số/")).toBeVisible();
    // Một vài thông số đặc trưng từ builtin
    await expect(modal.locator("text=Discharge pressure")).toBeVisible();
    await expect(modal.locator("text=Driven Bearing temperature")).toBeVisible();
  });

  test("offline: builtin config vẫn mở modal thông số PUMP_STATION_6", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    // Giả lập offline ở mức app (navigator.onLine + event) thay vì
    // context.setOffline — setOffline giết cả WebSocket HMR của vite dev,
    // client reconnect được qua loopback rồi tự reload trang → trang trắng.
    // ScanPage chỉ kiểm tra navigator.onLine nên override này test đúng code path.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });

    await sp.startAndScan("PUMP_STATION_6");

    // Offline → lưu queue + vẫn mở modal nhập thông số từ builtin
    await expect(page.locator("text=Thông số vận hành")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Discharge pressure")).toBeVisible();
  });
});
