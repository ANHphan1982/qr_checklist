/**
 * TDD — lib/importConfig: logic cho tab Import Excel trên trang Admin.
 *
 * - summarizeImportResult(result): chuyển response của POST /api/admin/import-config
 *   thành dữ liệu hiển thị — rows theo sheet (bỏ sheet không có trong file),
 *   tổng cộng, danh sách sheet thiếu + cảnh báo.
 * - fileToBase64(file): đọc File → chuỗi base64 (không kèm prefix data:).
 */
import { describe, it, expect } from "vitest";
import { summarizeImportResult, fileToBase64 } from "../importConfig";

const FULL_RESULT = {
  stations: { created: 2, updated: 1, skipped: 0 },
  aliases: { created: 0, updated: 3, skipped: 1 },
  params: null,
  missing_sheets: ["Thông số"],
  warnings: ["[QR Alias] Bỏ qua hàng thiếu qr_content/station_name: {...}"],
  dry_run: true,
};

describe("summarizeImportResult", () => {
  it("tạo rows theo sheet với nhãn tiếng Việt, bỏ sheet null", () => {
    const s = summarizeImportResult(FULL_RESULT);
    expect(s.rows).toEqual([
      { key: "stations", label: "Trạm", created: 2, updated: 1, skipped: 0 },
      { key: "aliases", label: "QR Alias", created: 0, updated: 3, skipped: 1 },
    ]);
  });

  it("tính tổng cộng created/updated/skipped", () => {
    const s = summarizeImportResult(FULL_RESULT);
    expect(s.total).toEqual({ created: 2, updated: 4, skipped: 1 });
  });

  it("chuyển tiếp missing_sheets và warnings", () => {
    const s = summarizeImportResult(FULL_RESULT);
    expect(s.missingSheets).toEqual(["Thông số"]);
    expect(s.warnings).toHaveLength(1);
  });

  it("chịu được response thiếu trường (mặc định rỗng)", () => {
    const s = summarizeImportResult({});
    expect(s.rows).toEqual([]);
    expect(s.total).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(s.missingSheets).toEqual([]);
    expect(s.warnings).toEqual([]);
  });
});

describe("fileToBase64", () => {
  it("đọc File thành chuỗi base64 không kèm data: prefix", async () => {
    const file = new File(["hello"], "test.xlsx");
    const b64 = await fileToBase64(file);
    expect(b64).toBe(btoa("hello"));
  });
});
