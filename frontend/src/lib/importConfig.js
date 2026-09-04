/**
 * Logic cho tab Import Excel (Admin) — tách khỏi component để test được.
 * Backend: POST /api/admin/import-config + GET /api/admin/import-template.
 */

const SHEET_LABELS = [
  { key: "stations", label: "Trạm" },
  { key: "aliases", label: "QR Alias" },
  { key: "params", label: "Thông số" },
];

/** Response import → dữ liệu hiển thị: rows theo sheet có trong file + tổng. */
export function summarizeImportResult(result) {
  const rows = [];
  const total = { created: 0, updated: 0, skipped: 0 };
  for (const { key, label } of SHEET_LABELS) {
    const counts = result?.[key];
    if (!counts) continue;
    rows.push({ key, label, ...counts });
    total.created += counts.created || 0;
    total.updated += counts.updated || 0;
    total.skipped += counts.skipped || 0;
  }
  return {
    rows,
    total,
    missingSheets: result?.missing_sheets || [],
    warnings: result?.warnings || [],
  };
}

/** File (input type=file) → chuỗi base64 thuần, không kèm prefix data:. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Không đọc được file"));
    reader.onload = () => {
      const url = String(reader.result || "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
