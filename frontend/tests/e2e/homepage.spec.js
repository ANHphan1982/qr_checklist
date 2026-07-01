import { test, expect } from "@playwright/test";
import { mockApiSuccess } from "./helpers/scan-page.js";

// HomePage là màn chọn loại checklist (route `/`). Mỗi card route tới
// /scan/:type. Routine (và mọi card) dùng đúng ScanPage hiện tại.

test.describe("HomePage — chọn checklist", () => {
  test.beforeEach(async ({ page }) => {
    // Mock health + scan để khi điều hướng sang ScanPage không phụ thuộc mạng thật.
    await mockApiSuccess(page);
    await page.goto("/");
  });

  test("hiển thị heading và đủ 6 checklist", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /chọn loại checklist/i })
    ).toBeVisible();

    for (const title of [
      "Pump Check List",
      "Tank Check List",
      "Routine Check List",
      "Valve Check List",
      "Safety Check List",
      "Electrical Check List",
    ]) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    }
  });

  // Ô tìm kiếm chỉ hiện khi danh sách ≥ SEARCH_MIN_ITEMS (8). Catalog hiện có 6
  // → search cố tình ẩn để đỡ nhiễu; mọi thẻ luôn hiển thị (không cần lọc).
  test("ô tìm kiếm ẩn khi danh sách ít hơn 8 checklist", async ({ page }) => {
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByText("Pump Check List", { exact: true })).toBeVisible();
    await expect(page.getByText("Tank Check List", { exact: true })).toBeVisible();
  });

  test("badge tổng số checklist hiển thị đúng số bộ", async ({ page }) => {
    // Section "Tất cả checklist" kèm badge "{n} bộ" — không lọc thì n = cả catalog.
    await expect(page.getByText("6 bộ", { exact: true })).toBeVisible();
  });

  test("click card Routine → /scan/routine và hiện trang scan", async ({ page }) => {
    await page.getByRole("button", { name: /Routine Check List/i }).last().click();

    await expect(page).toHaveURL(/\/scan\/routine$/);
    await expect(page.locator("button:has-text('Bắt đầu Scan')")).toBeVisible();
  });

  test("click card Pump → /scan/pump", async ({ page }) => {
    // Không còn ô tìm kiếm (catalog < 8) → click thẳng thẻ Pump.
    // .last() bỏ qua nút "Tiếp tục" nếu có (thẻ thật render sau trong DOM).
    await page.getByRole("button", { name: /Pump Check List/i }).last().click();

    await expect(page).toHaveURL(/\/scan\/pump$/);
  });

  test("nút Tiếp tục (gần đây) điều hướng sang scan", async ({ page }) => {
    // Thẻ "Tiếp tục" chỉ hiện khi đã có checklist mở gần nhất (localStorage).
    // Seed 'pump' rồi reload để nút xuất hiện.
    await page.evaluate(() => localStorage.setItem("qr_recent_checklist", "pump"));
    await page.reload();

    await page.getByRole("button", { name: /Tiếp tục/i }).click();

    await expect(page).toHaveURL(/\/scan\/pump$/);
    await expect(page.locator("button:has-text('Bắt đầu Scan')")).toBeVisible();
  });

  test("card pump/tank/routine hiển thị hình minh họa (img)", async ({ page }) => {
    for (const title of ["Pump Check List", "Tank Check List", "Routine Check List"]) {
      const card = page.getByRole("button", { name: new RegExp(title, "i") }).last();
      const img = card.locator("img");
      await expect(img.first()).toBeVisible();
    }
  });

  test("card có touch target đủ lớn (min 44px)", async ({ page }) => {
    const card = page.getByRole("button", { name: /Routine Check List/i }).last();
    const box = await card.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
});
