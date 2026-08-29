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
    // POM.goto() vào /scan/routine → h1 hiện tiêu đề checklist (checklistInfo.title),
    // không còn fallback "Quét QR Check-in" (chỉ dùng khi route không có checklist).
    await expect(page.locator("h1")).toContainText("Routine Check List");
    // Subtitle hướng dẫn hiển thị; step progress bar ẩn khi idle
    await expect(page.locator("text=Hướng camera vào mã QR")).toBeVisible();
  });

  test("no offline banner when online", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await expect(sp.offlineBanner).toHaveCount(0);
  });

  // ── GPS banner ────────────────────────────────────────────────────────

  test("GPS ready state does NOT show duplicate banner when scanner is open", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startButton.click();
    await expect(sp.qrReader).toBeVisible();

    // Wait briefly for GPS watch to resolve to "ready"
    await page.waitForTimeout(1500);

    // "GPS đã sẵn sàng" (PERMISSION_LABEL.granted) may appear — that is correct
    // "GPS đã bắt được tín hiệu" must NOT appear — it was the duplicate removed banner
    await expect(page.locator("text=GPS đã bắt được tín hiệu")).toHaveCount(0);
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
    // Flow cổ điển: camera đóng sau check-in → phải tắt chế độ quét liên tục
    // (mặc định BẬT). Chế độ liên tục có describe riêng bên dưới.
    await sp.setContinuousMode(false);
    await sp.goto();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toHaveAttribute("data-status", "ok");
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
    await sp.setContinuousMode(false);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.continueButton).toBeVisible({ timeout: 10_000 });

    await sp.continueButton.click();

    await expect(sp.startButton).toBeVisible();
    await expect(sp.resultCard).toHaveCount(0);
  });

  test("dismiss (×) button on result card returns to idle", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.setContinuousMode(false);
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

  test("5xx server error falls back to offline queue with offline result", async ({ page }) => {
    await mockApiError(page, 503, { status: "error", message: "Service Unavailable" });

    const sp = new ScanPagePOM(page);
    await sp.goto();
    await sp.clearStorage();

    await sp.startAndScan("Cổng A");

    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toHaveAttribute("data-status", "offline");
    // 5xx từ server → lưu offline, thông điệp chính là "Đã lưu offline"
    await expect(sp.resultCard).toContainText("Đã lưu offline");
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
    await expect(sp.resultCard).toHaveAttribute("data-status", "out_of_range");
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
    await expect(sp.resultCard).toHaveAttribute("data-status", "error");
    await expect(sp.resultCard).toContainText("quá nhiều lần");
    // Rate limit is NOT queued for retry
    await expect(sp.pendingBadge).toHaveCount(0);
  });

  test("can scan multiple times in sequence", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.setContinuousMode(false);
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

// ---------------------------------------------------------------------------
// Chế độ quét liên tục (mặc định BẬT) — camera sống qua nhiều trạm liền.
// Một vòng checklist tới 13 trạm; flow cũ khởi động lại camera mỗi trạm.
// ---------------------------------------------------------------------------
test.describe("Quét liên tục", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiSuccess(page);
  });

  test("mặc định bật", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();
    await expect(sp.continuousToggle).toHaveAttribute("aria-checked", "true");
  });

  test("camera KHÔNG đóng sau check-in, quét thẳng được trạm kế", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.resultCard).toContainText("Cổng A");

    // Khác hẳn flow cũ: camera còn nguyên, không có nút "Quét tiếp"
    await expect(sp.qrReader).toBeVisible();
    await expect(sp.continueButton).toHaveCount(0);
    await expect(sp.stopButton).toBeVisible();

    // Trạm kế tiếp — không phải bấm nút nào
    await sp.triggerScan("Trạm B");
    await expect(sp.resultCard).toContainText("Trạm B", { timeout: 10_000 });
    await expect(sp.qrReader).toBeVisible();
  });

  test("đóng thẻ kết quả không tắt camera", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });

    await page.locator('[aria-label="Đóng"]').click();

    await expect(sp.resultCard).toHaveCount(0);
    await expect(sp.qrReader).toBeVisible();
  });

  test("Dừng Camera đưa về idle", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.startAndScan("Cổng A");
    await expect(sp.stopButton).toBeVisible({ timeout: 10_000 });

    await sp.stopButton.click();

    await expect(sp.startButton).toBeVisible();
    await expect(sp.qrReader).toHaveCount(0);
  });

  test("tắt toggle → quay lại flow đóng camera sau check-in", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.continuousToggle.click();
    await expect(sp.continuousToggle).toHaveAttribute("aria-checked", "false");

    await sp.startAndScan("Cổng A");
    await expect(sp.resultCard).toBeVisible({ timeout: 10_000 });
    await expect(sp.qrReader).toHaveCount(0);
    await expect(sp.continueButton).toBeVisible();
  });

  test("lựa chọn tắt được nhớ qua lần mở app sau", async ({ page }) => {
    const sp = new ScanPagePOM(page);
    await sp.goto();

    await sp.continuousToggle.click();
    await expect(sp.continuousToggle).toHaveAttribute("aria-checked", "false");

    await page.reload();
    await page.waitForSelector("button:has-text('Bắt đầu Scan')");
    await expect(sp.continuousToggle).toHaveAttribute("aria-checked", "false");
  });
});
