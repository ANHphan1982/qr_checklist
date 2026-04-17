import { test, expect } from "@playwright/test";
import { ScanPagePOM, mockApiSuccess } from "./helpers/scan-page.js";

/**
 * Simulate going offline: cut Playwright-level network AND dispatch the DOM event
 * so React's window.addEventListener("offline") handler fires reliably.
 */
async function goOffline(page, context) {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

/**
 * Simulate coming back online: restore network AND dispatch the DOM event.
 */
async function goOnline(page, context) {
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

test.describe("Offline scan flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock all API routes so mounting/ping succeed while the page loads online
    await page.route("**/health", (r) => r.fulfill({ status: 200, body: "ok" }));
    await page.route("**/api/reports**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ date: "2026-04-17", total: 0, logs: [] }),
      })
    );
  });

  // ── Offline banner ─────────────────────────────────────────────────────

  test("offline banner appears when device goes offline", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    // Navigate while online, then simulate losing network
    await mockApiSuccess(page);
    await sp.goto();

    await goOffline(page, context);

    await expect(sp.offlineBanner).toBeVisible({ timeout: 3_000 });
    await expect(sp.offlineBanner).toContainText("scan vẫn hoạt động");
  });

  test("offline banner disappears when device goes back online", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();

    await goOffline(page, context);
    await expect(sp.offlineBanner).toBeVisible({ timeout: 3_000 });

    await goOnline(page, context);

    await expect(sp.offlineBanner).toHaveCount(0, { timeout: 5_000 });
  });

  // ── Scan while offline ─────────────────────────────────────────────────

  test("scan while offline saves to queue and shows 💾 result", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    await goOffline(page, context);
    await expect(sp.offlineBanner).toBeVisible({ timeout: 3_000 });

    await sp.startButton.click();
    await sp.triggerScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("💾");
    await expect(sp.resultCard).toContainText("Đã lưu offline");
    await expect(sp.resultCard).toContainText("Cổng A");
  });

  test("offline scan increments pending count", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    await goOffline(page, context);
    await sp.startButton.click();
    await sp.triggerScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });

    // Offline variant shows pending count without sync button
    await expect(sp.pendingOffline).toBeVisible();
    await expect(sp.pendingOffline).toContainText("1 scan đang chờ");
  });

  test("multiple offline scans accumulate in queue", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    await goOffline(page, context);

    // First scan
    await sp.startButton.click();
    await sp.triggerScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await sp.continueButton.click();
    await expect(sp.startButton).toBeVisible();

    // Second scan
    await sp.startButton.click();
    await sp.triggerScan("Trạm B");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });

    await expect(sp.pendingOffline).toContainText("2 scan đang chờ");
  });

  test("offline result card shows location and timestamp", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    await goOffline(page, context);
    await sp.startButton.click();
    await sp.triggerScan("Trạm Kiểm Soát C");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });

    await expect(sp.resultCard).toContainText("Trạm Kiểm Soát C");
    await expect(sp.resultCard).toContainText("Thời gian:");
  });

  // ── Auto-sync on network return ────────────────────────────────────────

  test("auto-sync triggers when network comes back online", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    // Scan offline
    await goOffline(page, context);
    await sp.startButton.click();
    await sp.triggerScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await sp.continueButton.click();
    await expect(sp.pendingOffline).toBeVisible();

    // Restore network — auto-sync fires via the "online" listener
    await mockApiSuccess(page);
    await goOnline(page, context);

    await expect(sp.syncMsg).toBeVisible({ timeout: 8_000 });
    await expect(sp.syncMsg).toContainText("Đã đồng bộ 1 scan offline");
    // Queue cleared
    await expect(sp.pendingOffline).toHaveCount(0, { timeout: 5_000 });
    await expect(sp.pendingBadge).toHaveCount(0);
  });

  // ── Manual sync button ─────────────────────────────────────────────────

  test("manual sync button sends queued items while online", async ({ page }) => {
    const sp = new ScanPagePOM(page);

    // Seed localStorage BEFORE navigation via addInitScript so no reload is needed
    await page.addInitScript(() => {
      localStorage.setItem(
        "qr_offline_queue",
        JSON.stringify([
          {
            location: "Cổng B",
            device_id: "test-device-id",
            scanned_at: new Date(Date.now() - 60_000).toISOString(),
            lat: 10.7769,
            lng: 106.7009,
            accuracy: 10,
            queued_at: new Date(Date.now() - 60_000).toISOString(),
          },
        ])
      );
    });

    // All API scan calls return 500 initially so auto-sync fails and badge stays visible
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Server unavailable" }),
      })
    );

    await sp.goto();

    // Auto-sync fires on mount, fails → badge and sync button remain visible
    await expect(sp.pendingBadge).toBeVisible({ timeout: 5_000 });
    await expect(sp.syncButton).not.toBeDisabled({ timeout: 5_000 });

    // Swap route so the manual click succeeds
    await page.unroute("**/api/scan");
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", scan_id: 1, email_sent: true }),
      })
    );

    // Manual sync click succeeds
    await sp.syncButton.click();
    await expect(sp.syncMsg).toBeVisible({ timeout: 8_000 });
    await expect(sp.syncMsg).toContainText("Đã đồng bộ 1 scan offline");
    await expect(sp.pendingBadge).toHaveCount(0, { timeout: 5_000 });
  });

  // ── Auto-sync silence (isAuto fix) ────────────────────────────────────

  test("auto-sync on mount failure is silent — no error banner", async ({ page }) => {
    // Seed queue before navigation so auto-sync fires on mount
    await page.addInitScript(() => {
      localStorage.setItem(
        "qr_offline_queue",
        JSON.stringify([{
          location: "Cổng A",
          device_id: "test-id",
          scanned_at: new Date(Date.now() - 60_000).toISOString(),
          queued_at: new Date(Date.now() - 60_000).toISOString(),
          lat: null, lng: null, accuracy: null,
        }])
      );
    });

    // Server always returns 500 → auto-sync will fail silently
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Server error" }),
      })
    );

    const sp = new ScanPagePOM(page);
    await sp.goto();

    // Queue badge must still show (items not cleared)
    await expect(sp.pendingBadge).toBeVisible({ timeout: 5_000 });

    // Wait enough time for auto-sync to complete and any message to appear
    await page.waitForTimeout(3_000);

    // Auto-sync failure must be silent — no red error banner
    await expect(page.locator("text=/Không đồng bộ được|Lỗi đồng bộ/")).toHaveCount(0);
  });

  test("auto-sync when network returns and server is down is silent", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    // Scan offline
    await goOffline(page, context);
    await sp.startButton.click();
    await sp.triggerScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await sp.continueButton.click();
    await expect(sp.pendingOffline).toBeVisible();

    // Go back online but server returns 500 → auto-sync will fail
    await page.unroute("**/api/scan");
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Server error" }),
      })
    );
    await goOnline(page, context);

    // Wait enough time for auto-sync to complete
    await page.waitForTimeout(3_000);

    // No error banner — auto-sync is silent on failure
    await expect(page.locator("text=/Không đồng bộ được|Lỗi đồng bộ/")).toHaveCount(0);
    // Item still in queue
    await expect(sp.pendingBadge).toBeVisible();
  });

  test("sync failure shows error message and keeps items in queue", async ({ page }) => {
    const sp = new ScanPagePOM(page);

    // Seed localStorage BEFORE navigation
    await page.addInitScript(() => {
      localStorage.setItem(
        "qr_offline_queue",
        JSON.stringify([
          {
            location: "Cổng C",
            device_id: "test-device-id",
            scanned_at: new Date(Date.now() - 60_000).toISOString(),
            queued_at: new Date(Date.now() - 60_000).toISOString(),
            lat: null,
            lng: null,
            accuracy: null,
          },
        ])
      );
    });

    // API returns 500 — item stays in queue
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Server error" }),
      })
    );
    await sp.goto();

    await expect(sp.pendingBadge).toBeVisible({ timeout: 5_000 });
    // Đợi auto-sync im lặng hoàn tất rồi mới bấm thủ công
    await expect(sp.syncButton).toBeVisible({ timeout: 5_000 });
    await sp.syncButton.click();

    await expect(sp.syncMsg).toBeVisible({ timeout: 8_000 });
    await expect(sp.syncMsg).toContainText("Không đồng bộ được");
    // Item still in queue
    await expect(sp.pendingBadge).toBeVisible();
  });

  // ── Network error → offline fallback ──────────────────────────────────

  test("aborted network request during scan falls back to offline queue", async ({ page }) => {
    // Health succeeds (page loads), but scan API is aborted (network drop mid-flight)
    await page.route("**/api/scan", (r) => r.abort("failed"));

    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 15_000 });
    await expect(sp.resultCard).toContainText("💾");
    // Phone is online (navigator.onLine=true) but request failed → "server không phản hồi"
    // Playwright abort() with online=true → classifyApiError → server_unreachable
    await expect(sp.resultCard).toContainText("kết nối");
  });

  test("scan while phone truly offline (navigator.onLine=false) shows đã lưu offline", async ({ page, context }) => {
    const sp = new ScanPagePOM(page);
    await mockApiSuccess(page);
    await sp.goto();
    await sp.clearStorage();

    // Go offline — navigator.onLine becomes false
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await sp.startButton.click();
    await sp.triggerScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("💾");
    // navigator.onLine=false → skip API call entirely → "Đã lưu offline"
    await expect(sp.resultCard).toContainText("Đã lưu offline");
  });
});
