import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { resolveParamStatus } from "../lib/paramStatus";
import { isYesNoUnit } from "../lib/paramUnits";
import Button from "./ui/Button";

/**
 * Chuẩn hoá config về danh sách thông số (multi-param).
 * - Shape mới: { station_name, params: [ {tag, param_label, param_unit, param_low, param_high}, ... ] }
 * - Shape cũ (1 thông số/trạm): { param_label, param_unit, param_low, param_high } → bọc thành mảng 1 phần tử.
 */
function normalizeParams(config) {
  if (config?.params && Array.isArray(config.params)) return config.params;
  if (config?.param_label) {
    return [{
      tag:         config.tag ?? null,
      param_label: config.param_label,
      param_unit:  config.param_unit,
      param_low:   config.param_low ?? null,
      param_high:  config.param_high ?? null,
    }];
  }
  return [];
}

// Thông số Yes/No lưu đúng 2 giá trị này — khớp isYesNoUnit ở backend/Excel.
const YN_OPTIONS = [
  { value: "Y", label: "Có (Y)" },
  { value: "N", label: "Không (N)" },
];

export default function OperationalParamsModal({ location, config, onSubmit, onSkip }) {
  const params = normalizeParams(config);
  const [values, setValues] = useState(() => params.map(() => ""));
  // Ref theo index để Enter nhảy sang ô kế tiếp. Ô Yes/No là nút bấm, không
  // phải input → giữ null và bị bỏ qua khi tìm ô kế.
  const inputRefs = useRef([]);

  const setValueAt = (i, v) =>
    setValues((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  // Index ô nhập số kế tiếp sau `from`, hoặc -1 nếu đây là ô cuối.
  // Suy từ config chứ không từ inputRefs — ref chỉ được gán SAU lượt render đầu,
  // dựa vào ref sẽ khiến enterKeyHint sai ở lần render đầu tiên.
  const nextInputIndex = (from) => {
    for (let j = from + 1; j < params.length; j++) {
      if (!isYesNoUnit(params[j].param_unit)) return j;
    }
    return -1;
  };

  // Enter = sang ô kế; ở ô cuối để form tự submit (enterKeyHint="done").
  const handleKeyDown = (e, i) => {
    if (e.key !== "Enter") return;
    const next = nextInputIndex(i);
    if (next !== -1) {
      e.preventDefault();
      inputRefs.current[next]?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const param_values = params.map((p, i) => {
      const raw = (values[i] ?? "").trim();
      // Thông số Yes/No: lưu nguyên text (Y/N/Yes/No...); còn lại parse số.
      let value = null;
      if (raw !== "") value = isYesNoUnit(p.param_unit) ? raw : parseFloat(raw);
      return {
        tag:   p.tag ?? null,
        label: p.param_label,
        unit:  p.param_unit,
        value,
        low:   p.param_low ?? null,
        high:  p.param_high ?? null,
      };
    });
    onSubmit({ param_values });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="anim-card-in w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 shadow-xl flex flex-col max-h-[88vh]">

        <div className="p-6 pb-3">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Thông số vận hành
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Trạm: <span className="font-semibold text-slate-700 dark:text-slate-200">{location}</span>
          </p>
          {params.length > 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {params.length} thông số — có thể bỏ trống ô không đo được
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-6 overflow-y-auto flex-1">
            {params.map((p, i) => {
              const label = p.param_label || "Thông số";
              const unit  = p.param_unit  || "";
              const low   = p.param_low  ?? null;
              const high  = p.param_high ?? null;
              const isYN  = isYesNoUnit(unit);
              const paramStatus = resolveParamStatus(values[i], low, high);

              const inputBorder = {
                empty:   "border-slate-300 dark:border-slate-600 focus:ring-blue-500",
                normal:  "border-green-400 dark:border-green-600 focus:ring-green-500",
                warning: "border-orange-400 dark:border-orange-500 focus:ring-orange-400",
              }[paramStatus.status];

              return (
                <div key={p.id ?? i} className="flex flex-col gap-1.5">
                  <label
                    id={`op-param-label-${i}`}
                    {...(isYN ? {} : { htmlFor: `op-param-input-${i}` })}
                    className="text-base font-medium text-slate-700 dark:text-slate-200"
                  >
                    {p.tag && (
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400 mr-1.5">{p.tag}</span>
                    )}
                    {label}{unit ? ` (${unit})` : ""}
                  </label>

                  {isYN ? (
                    // Segmented 2 nút thay ô text: 1 tap thay vì mở bàn phím chữ
                    // và gõ tay ("Yes"/"y"/"co" đều từng xuất hiện trong dữ liệu).
                    // Tap lại lựa chọn đang chọn = bỏ chọn (ô được phép để trống).
                    <div
                      role="radiogroup"
                      aria-labelledby={`op-param-label-${i}`}
                      className="grid grid-cols-2 gap-2"
                    >
                      {YN_OPTIONS.map((opt) => {
                        const selected = values[i] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setValueAt(i, selected ? "" : opt.value)}
                            className={[
                              "min-h-[56px] rounded-xl border-2 text-base font-bold transition-colors",
                              selected
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-600",
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      id={`op-param-input-${i}`}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      enterKeyHint={nextInputIndex(i) === -1 ? "done" : "next"}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      value={values[i]}
                      onChange={(e) => setValueAt(i, e.target.value)}
                      placeholder={`Nhập ${label}...`}
                      className={`w-full rounded-xl border bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-4 py-3 text-base focus:outline-none focus:ring-2 transition-colors ${inputBorder}`}
                      autoFocus={i === 0}
                    />
                  )}

                  {low != null && high != null && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Ngưỡng bình thường: <span className="font-semibold">{low}–{high} {unit}</span>
                    </p>
                  )}
                  {low != null && high == null && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Ngưỡng thấp (L): <span className="font-semibold">{low} {unit}</span>
                    </p>
                  )}
                  {low == null && high != null && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Ngưỡng cao (H): <span className="font-semibold">{high} {unit}</span>
                    </p>
                  )}

                  {paramStatus.status === "warning" && (
                    <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
                      <span>{paramStatus.message}</span>
                    </p>
                  )}
                  {paramStatus.status === "normal" && (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden />
                      <span>Trong ngưỡng bình thường</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 p-6 pt-4">
            <Button type="button" variant="outline" onClick={onSkip} className="flex-1">
              Bỏ qua
            </Button>
            <Button type="submit" className="flex-1 font-bold">
              Lưu
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
