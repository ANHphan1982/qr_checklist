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

  test("search lọc checklist theo tên", async ({ page }) => {
    await page.getByRole("searchbox").fill("pump");

    await expect(page.getByText("Pump Check List", { exact: true })).toBeVisible();
    await expect(page.getByText("Tank Check List", { exact: true })).toHaveCount(0);
  });

  test("search không khớp hiển thị thông báo rỗng", async ({ page }) => {
    await page.getByRole("searchbox").fill("zzzkhongco");

    await expect(page.getByText(/không tìm thấy checklist/i)).toBeVisible();
  });

  test("click card Routine → /scan/routine và hiện trang scan", async ({ page }) => {
    await page.getByRole("button", { name: /Routine Check List/i }).last().click();

    await expect(page).toHaveURL(/\/scan\/routine$/);
    await expect(page.locator("button:has-text('Bắt đầu Scan')")).toBeVisible();
  });

  test("click card Pump → /scan/pump", async ({ page }) => {
    // Lọc còn mỗi Pump để chắc chắn click đúng card (không dính nút Tiếp tục).
    await page.getByRole("searchbox").fill("pump");
    await page.getByRole("button", { name: /Pump Check List/i }).last().click();

    await expect(page).toHaveURL(/\/scan\/pump$/);
  });

  test("nút Tiếp tục (gần đây) điều hướng sang scan", async ({ page }) => {
    await page.getByRole("button", { name: /Tiếp tục/i }).click();

    await expect(page).toHaveURL(/\/scan\/[a-z]+$/);
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
