import { test, expect } from "@playwright/test";

const ADMIN_KEY = "test-admin-secret";

const MOCK_STATIONS = [
  { name: "CONG-A", lat: 10.7769, lng: 106.7009, radius: 300, active: true },
  { name: "CONG-B", lat: 10.7800, lng: 106.7050, radius: 200, active: true },
];

const MOCK_ALIASES = [
  { id: 1, qr_content: "052-LI-066B", station_name: "CONG-A", note: "Thiết bị 052" },
];

/** Route admin API endpoints. */
async function mockAdminApi(page, { stations = MOCK_STATIONS, aliases = MOCK_ALIASES } = {}) {
  await page.route("**/api/admin/stations**", async (r) => {
    const key = r.request().headers()["x-admin-key"];
    if (key !== ADMIN_KEY) {
      return r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    }
    if (r.request().method() === "GET") {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stations) });
    }
    const body = JSON.parse(r.request().postData() || "{}");
    const created = { name: (body.name || "").toUpperCase(), lat: Number(body.lat), lng: Number(body.lng), radius: Number(body.radius ?? 300), active: true };
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
  });

  await page.route("**/api/admin/qr-aliases**", async (r) => {
    const key = r.request().headers()["x-admin-key"];
    if (key !== ADMIN_KEY) {
      return r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) });
    }
    if (r.request().method() === "GET") {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(aliases) });
    }
    const body = JSON.parse(r.request().postData() || "{}");
    const created = { id: 99, qr_content: body.qr_content, station_name: body.station_name, note: body.note ?? "" };
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
  });
}

/** Navigate to /admin and log in with the given key. */
async function loginAdmin(page, key = ADMIN_KEY) {
  await page.goto("/admin");
  await page.waitForSelector("input[type='password']");
  await page.fill("input[type='password']", key);
  await page.locator("button[type='submit']").click();
  // "Đăng xuất" chỉ xuất hiện trong AdminDashboard, không có trong LoginGate
  await expect(page.locator("button:has-text('Đăng xuất')")).toBeVisible({ timeout: 8_000 });
}

// ────────────────────────────────────────────────────────────────────────────
test.describe("Admin page — login gate", () => {
  test("renders password input and heading", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Admin QR Checklist");
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("login button is disabled when password is empty", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("button[type='submit']")).toBeDisabled();
  });

  test("login button is enabled once password is typed", async ({ page }) => {
    await page.goto("/admin");
    await page.fill("input[type='password']", "abc");
    await expect(page.locator("button[type='submit']")).not.toBeDisabled();
  });

  test("wrong password shows error message", async ({ page }) => {
    await mockAdminApi(page);
    await page.goto("/admin");
    await page.fill("input[type='password']", "wrong-key");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("text=Sai mật khẩu admin")).toBeVisible({ timeout: 8_000 });
  });

  test("correct password shows admin dashboard", async ({ page }) => {
    await mockAdminApi(page);
    await loginAdmin(page);
    // Dashboard header
    await expect(page.locator("h1")).toContainText("Admin");
    // Tab buttons visible — "📍 Trạm" with emoji avoids matching "Thêm trạm"
    await expect(page.getByRole("button", { name: /Trạm \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /QR Alias \(\d+\)/ })).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────────────────────
test.describe("Admin page — dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page);
    await loginAdmin(page);
  });

  test("station list renders mocked stations", async ({ page }) => {
    await expect(page.locator("text=CONG-A")).toBeVisible();
    await expect(page.locator("text=CONG-B")).toBeVisible();
  });

  test("station form has lat/lng/radius fields", async ({ page }) => {
    await expect(page.locator("input[placeholder*='TK-5201A']")).toBeVisible();
    await expect(page.locator("input[placeholder*='15.408751']")).toBeVisible();
    await expect(page.locator("input[placeholder*='108.814616']")).toBeVisible();
  });

  test("tab switch shows QR Alias panel with mocked aliases", async ({ page }) => {
    await page.getByRole("button", { name: /QR Alias/ }).click();
    await expect(page.locator("text=052-LI-066B")).toBeVisible();
  });

  test("adding a new station shows it in the list", async ({ page }) => {
    let stationsData = [...MOCK_STATIONS];
    await page.unroute("**/api/admin/stations**");
    await page.route("**/api/admin/stations**", async (r) => {
      if (r.request().method() === "GET") {
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stationsData) });
      }
      const body = JSON.parse(r.request().postData() || "{}");
      const created = { name: (body.name || "").toUpperCase(), lat: Number(body.lat), lng: Number(body.lng), radius: 300, active: true };
      stationsData = [...stationsData, created];
      return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
    });

    await page.fill("input[placeholder*='TK-5201A']", "TRAM-TEST");
    await page.fill("input[placeholder*='15.408751']", "10.7769");
    await page.fill("input[placeholder*='108.814616']", "106.7009");
    await page.locator("button[type='submit']").click();

    // exact match tránh nhầm với flash message "Đã thêm trạm TRAM-TEST"
    await expect(page.getByText("TRAM-TEST", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("adding a QR alias shows it in alias list", async ({ page }) => {
    let aliasData = [...MOCK_ALIASES];
    await page.unroute("**/api/admin/qr-aliases**");
    await page.route("**/api/admin/qr-aliases**", async (r) => {
      if (r.request().method() === "GET") {
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(aliasData) });
      }
      const body = JSON.parse(r.request().postData() || "{}");
      const created = { id: 99, qr_content: body.qr_content, station_name: body.station_name, note: body.note ?? "" };
      aliasData = [...aliasData, created];
      return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
    });

    await page.getByRole("button", { name: /QR Alias/ }).click();

    await page.fill("input[placeholder*='052-LI-066B']", "TEST-QR-999");
    await page.locator("select").selectOption("CONG-A");
    await page.locator("button[type='submit']").click();

    // exact match tránh nhầm với flash message "Đã thêm alias: TEST-QR-999 → ..."
    await expect(page.getByText("TEST-QR-999", { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test("logout button returns to login page", async ({ page }) => {
    await page.locator("button:has-text('Đăng xuất')").click();
    await expect(page.locator("input[type='password']")).toBeVisible({ timeout: 3_000 });
  });
});
