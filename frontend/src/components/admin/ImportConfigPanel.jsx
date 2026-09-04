import { useRef, useState } from "react";
import { Download, Eye, FileSpreadsheet, FileUp, Loader2 } from "lucide-react";
import { summarizeImportResult, fileToBase64 } from "../../lib/importConfig";

/**
 * Tab Import — upload file Excel template (Trạm / QR Alias / Thông số) để
 * nhập hàng loạt thay cho gõ tay từng dòng. Luồng: tải template → điền →
 * Xem trước (dry-run, không ghi DB) → Import thật.
 */
export default function ImportConfigPanel({ client, onRefresh, flash }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(null); // "template" | "preview" | "import"
  const [summary, setSummary] = useState(null); // { ...summarize, dryRun }

  const downloadTemplate = async () => {
    setBusy("template");
    try {
      const { data } = await client.get("/api/admin/import-template", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cau_hinh_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash(false, `Không tải được template: ${e?.response?.data?.error || e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (dryRun) => {
    if (!file) return;
    if (!dryRun && !window.confirm(
      `Import thật file "${file.name}" vào DB?\nDữ liệu trùng sẽ bị cập nhật đè (không xóa gì).`)) return;
    setBusy(dryRun ? "preview" : "import");
    try {
      const file_base64 = await fileToBase64(file);
      const { data } = await client.post("/api/admin/import-config", { file_base64, dry_run: dryRun });
      setSummary({ ...summarizeImportResult(data), dryRun });
      if (!dryRun) {
        flash(true, "Đã import vào DB");
        onRefresh();
      }
    } catch (e) {
      flash(false, e?.response?.data?.error || e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" aria-hidden />
          Nhập hàng loạt từ Excel
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Tải template → điền Trạm / QR Alias / Thông số → Xem trước → Import.
          Import lại không tạo bản sao (cập nhật đè theo khóa), không xóa dữ liệu cũ.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={downloadTemplate}
          disabled={busy !== null}
          className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "template"
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            : <Download className="w-4 h-4" aria-hidden />}
          Tải template
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setSummary(null); }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          <FileUp className="w-4 h-4" aria-hidden />
          {file ? file.name : "Chọn file .xlsx"}
        </button>

        <button
          onClick={() => runImport(true)}
          disabled={!file || busy !== null}
          className="text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "preview"
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            : <Eye className="w-4 h-4" aria-hidden />}
          Xem trước
        </button>

        <button
          onClick={() => runImport(false)}
          disabled={!file || busy !== null}
          className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "import"
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            : <FileUp className="w-4 h-4" aria-hidden />}
          Import thật
        </button>
      </div>

      {summary && (
        <div className="space-y-3">
          <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
            summary.dryRun
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
              : "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200"
          }`}>
            {summary.dryRun
              ? "Xem trước (dry-run) — CHƯA ghi gì vào DB. Kiểm tra số liệu rồi bấm Import thật."
              : "Đã import vào DB."}
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm w-full min-w-[420px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-4">Sheet</th>
                  <th className="py-1.5 pr-4">Tạo mới</th>
                  <th className="py-1.5 pr-4">Cập nhật</th>
                  <th className="py-1.5">Bỏ qua</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200">
                {summary.rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-1.5 pr-4 font-medium">{r.label}</td>
                    <td className="py-1.5 pr-4">{r.created}</td>
                    <td className="py-1.5 pr-4">{r.updated}</td>
                    <td className="py-1.5">{r.skipped}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1.5 pr-4">Tổng</td>
                  <td className="py-1.5 pr-4">{summary.total.created}</td>
                  <td className="py-1.5 pr-4">{summary.total.updated}</td>
                  <td className="py-1.5">{summary.total.skipped}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {summary.missingSheets.length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              File không có sheet: {summary.missingSheets.join(", ")} (bỏ qua phần đó).
            </p>
          )}

          {summary.warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                Hàng bị bỏ qua ({summary.warnings.length}):
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc pl-4">
                {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
