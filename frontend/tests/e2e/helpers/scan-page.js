/**
 * Page Object Model for the Scan page (/).
 * Encapsulates selectors and common actions to keep test files readable.
 */
export class ScanPagePOM {
  constructor(page) {
    this.page = page;
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  async goto() {
    await this.page.goto("/");
    // Wait for React to hydrate and initial GPS permission check to finish
    await this.page.waitForSelector("button:has-text('Bắt đầu Scan')");
  }

  // ── Locators ────────────────────────────────────────────────────────────
  get startButton()    { return this.page.locator("button:has-text('Bắt đầu Scan')"); }
  get stopButton()     { return this.page.locator("button:has-text('Dừng Camera')"); }
  get continueButton() { return this.page.locator("button:has-text('Quét tiếp')"); }
  get syncButton()     { return this.page.locator("button:has-text('Đồng bộ')"); }
  get resultCard()     { return this.page.getByTestId("scan-result"); }
  get offlineBanner()  { return this.page.locator("text=Không có mạng"); }
  get pendingBadge()   { return this.page.locator("text=/\\d+ scan chờ đồng bộ/"); }
  get pendingOffline() { return this.page.locator("text=/\\d+ scan đang chờ/"); }
  get syncMsg()        { return this.page.locator("text=/Đã đồng bộ|Không đồng bộ được/"); }
  get qrReader()       { return this.page.locator("#qr-reader"); }

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Simulate a QR code decode by calling the scanner's exposed test hook. */
  async triggerScan(qrText) {
    await this.qrReader.waitFor({ state: "visible" });
    // Wait for the DEV hook to be registered by the useEffect
    await this.page.waitForFunction(() => typeof window.__triggerQRScan === "function");
    await this.page.evaluate((text) => window.__triggerQRScan(text), qrText);
  }

  /** Click Start, wait for scanner, trigger QR scan. */
  async startAndScan(qrText) {
    await this.startButton.click();
    await this.triggerScan(qrText);
  }

  /** Clear offline queue and device_id between tests for isolation. */
  async clearStorage() {
    try {
      await this.page.evaluate(() => {
        localStorage.removeItem("qr_offline_queue");
      });
    } catch {
      // Vite dev đôi khi full-reload trang 1 lần ngay sau load (giữa full suite)
      // → execution context destroyed. Đợi trang ổn định rồi thử lại.
      await this.page.waitForSelector("button:has-text('Bắt đầu Scan')");
      await this.page.evaluate(() => {
        localStorage.removeItem("qr_offline_queue");
      });
    }
  }
}

// ── API route helpers ──────────────────────────────────────────────────────

/**
 * Chặn các nguồn tự-reload trang trong test:
 *
 * 1. sw.js — handler activate gọi clients.navigate() (tự reload tab khi SW mới
 *    kích hoạt) → reload bất ngờ giữa test.
 * 2. /__vite_ping — khi test setOffline, websocket HMR đứt → vite client poll
 *    __vite_ping bằng fetch. Offline emulation của Chromium KHÔNG chặn fetch
 *    tới localhost → ping thành công → client reload → trang trắng (module
 *    không load được khi offline) → reload loop đến hết timeout.
 *
 * Cả 2 chỉ tồn tại ở dev/test, không ảnh hưởng production.
 */
export async function blockServiceWorker(page) {
  await page.route("**/sw.js", (r) => r.abort());
  await page.route("**/__vite_ping", (r) => r.abort());
}

/** Mock /health and /api/scan with a successful 200 response. */
export async function mockApiSuccess(page, overrides = {}) {
  await blockServiceWorker(page);
  await page.route("**/health", (r) => r.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", scan_id: 1, email_sent: true, ...overrides }),
    })
  );
  await page.route("**/api/reports**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ date: "2026-04-17", total: 0, logs: [] }),
    })
  );
}

/** Mock /api/scan with a 4xx or 5xx error response. */
export async function mockApiError(page, status, body) {
  await blockServiceWorker(page);
  await page.route("**/health", (r) => r.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/scan", (r) =>
    r.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  );
}
