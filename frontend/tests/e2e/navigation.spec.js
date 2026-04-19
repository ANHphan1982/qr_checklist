import { test, expect } from "@playwright/test";

test.describe("Bottom navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hiển thị bottom tab bar với 2 tab Scan và Lịch sử", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: /tab/i });
    await expect(nav).toBeVisible();

    await expect(page.getByRole("link", { name: /scan/i }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: /lịch sử/i }).last()).toBeVisible();
  });

  test("tab Scan active khi ở trang chủ", async ({ page }) => {
    // Tab Scan phải có class active (bg-blue-600 hoặc text-blue-600)
    const scanLink = page.getByRole("link", { name: /scan/i }).last();
    await expect(scanLink).toHaveAttribute("aria-current", "page");
  });

  test("click tab Lịch sử → navigate đến /history", async ({ page }) => {
    await page.getByRole("link", { name: /lịch sử/i }).last().click();
    await expect(page).toHaveURL(/\/history/);
    await expect(page.getByRole("heading", { name: /lịch sử/i })).toBeVisible();
  });

  test("click tab Scan từ /history → quay về trang chủ", async ({ page }) => {
    await page.goto("/history");
    await page.getByRole("link", { name: /scan/i }).last().click();
    await expect(page).toHaveURL(/^http:\/\/localhost:5173\/$/);
  });

  test("touch target tab bar đủ lớn (min 44px)", async ({ page }) => {
    const scanLink = page.getByRole("link", { name: /scan/i }).last();
    const box = await scanLink.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });

  test("NavBar không chứa NavLink Scan/Lịch sử (đã chuyển xuống bottom)", async ({ page }) => {
    const header = page.locator("header");
    // Header chỉ có logo và dark toggle, không có NavLink điều hướng
    await expect(header.getByRole("link", { name: /^scan$/i })).toHaveCount(0);
    await expect(header.getByRole("link", { name: /^lịch sử$/i })).toHaveCount(0);
  });

  test("trang /station/:name không có bottom tab bar", async ({ page }) => {
    await page.goto("/station/C%E1%BB%95ng%20A");
    const nav = page.getByRole("navigation", { name: /tab/i });
    await expect(nav).toHaveCount(0);
  });
});

test.describe("NavBar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hiển thị tiêu đề QR Checklist", async ({ page }) => {
    await expect(page.getByRole("banner").getByText("QR Checklist")).toBeVisible();
  });

  test("nút dark mode toggle hoạt động", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /chế độ/i });
    await expect(toggle).toBeVisible();

    const html = page.locator("html");
    const before = await html.getAttribute("class");
    await toggle.click();
    const after = await html.getAttribute("class");
    expect(before).not.toBe(after);
  });
});
