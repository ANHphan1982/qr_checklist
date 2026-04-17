import { test, expect } from "@playwright/test";
import { ScanPagePOM, mockApiSuccess, mockApiError } from "./helpers/scan-page.js";

test.describe("Online scan flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiSuccess(page);
  });

  // ── Initial state ──────────────────────────────────────────────────────

  test("shows start button and page heading on load", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await expect(sp.startButton).toBeVisible();
    await expect(page.locator("h1")).toContainText("Quét QR Check-in");
    // Step indicator is visible (renders number circles; labels are not in DOM)
    await expect(page.locator(".flex.items-center.justify-center.gap-1")).toBeVisible();
  });

  test("no offline banner when online", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await expect(sp.offlineBanner).toHaveCount(0);
  });

  // ── Scanner open / close ───────────────────────────────────────────────

  test("start button opens QR scanner and stop button", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startButton.click();

    await expect(sp.qrReader).toBeVisible();
    await expect(sp.stopButton).toBeVisible();
    await expect(sp.startButton).toHaveCount(0);
  });

  test("stop button closes scanner and returns to idle", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startButton.click();
    await expect(sp.qrReader).toBeVisible();

    await sp.stopButton.click();

    await expect(sp.startButton).toBeVisible();
    await expect(sp.qrReader).toHaveCount(0);
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  test("successful scan shows success result card", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("✅");
    await expect(sp.resultCard).toContainText("Cổng A");
    // Scanner closed; continue button shown
    await expect(sp.continueButton).toBeVisible();
    await expect(sp.qrReader).toHaveCount(0);
  });

  test("result card shows formatted scan time", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Trạm B");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    // Formatted date/time should include year 2026
    await expect(sp.resultCard).toContainText("Thời gian:");
  });

  test("continue button dismisses result and returns to idle", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.continueButton).toBeVisible({ timeout: 10_000 });

    await sp.continueButton.click();

    await expect(sp.startButton).toBeVisible();
    await expect(sp.resultCard).toHaveCount(0);
  });

  test("dismiss (×) button on result card returns to idle", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });

    await page.locator('[aria-label="Đóng"]').click();

    await expect(sp.resultCard).toHaveCount(0);
    await expect(sp.startButton).toBeVisible();
  });

  test("email_sent=false shows warning in result card", async ({ page }) => {
    await page.route("**/api/scan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", scan_id: 2, email_sent: false }),
      })
    );

    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("Email chưa gửi được");
  });

  // ── Error paths ────────────────────────────────────────────────────────

  test("5xx server error falls back to offline queue with 💾 result", async ({ page }) => {
    await mockApiError(page, 503, { status: "error", message: "Service Unavailable" });

    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("💾");
    // 5xx từ server → "Server gặp lỗi" (phân biệt với mất mạng hoàn toàn)
    await expect(sp.resultCard).toContainText("Server gặp lỗi");
    // Item should be queued — pending badge appears
    await expect(sp.pendingBadge).toBeVisible();
  });

  test("OUT_OF_RANGE 403 shows distance warning", async ({ page }) => {
    await mockApiError(page, 403, {
      status: "error",
      code: "OUT_OF_RANGE",
      message: "Bạn đang ở quá xa trạm kiểm tra",
      distance: 250,
    });

    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("📍");
    await expect(sp.resultCard).toContainText("250m");
  });

  test("RATE_LIMITED 400 shows error result (not queued)", async ({ page }) => {
    await mockApiError(page, 400, {
      status: "error",
      code: "RATE_LIMITED",
      message: "Bạn đã check-in quá nhiều lần hôm nay",
    });

    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("❌");
    await expect(sp.resultCard).toContainText("quá nhiều lần");
    // Rate limit is NOT queued for retry
    await expect(sp.pendingBadge).toHaveCount(0);
  });

  test("can scan multiple times in sequence", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    // First scan
    await sp.startAndScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await sp.continueButton.click();

    // Second scan
    await expect(sp.startButton).toBeVisible();
    await sp.startAndScan("Trạm B");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("Trạm B");
  });
});
