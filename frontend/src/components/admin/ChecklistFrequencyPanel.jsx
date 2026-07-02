// ChecklistFrequencyPanel — đặt TẦN SUẤT ghi thông số cho từng checklist.
//   pump = mỗi ca, safety = mỗi ngày, ... (8h/lần, 4h/lần, tháng/lần...)
//
// Tần suất quyết định cửa sổ tính "chưa kiểm tra" ở Trang chủ (checklistCoverage
// nhận period từ getPeriodAt). Mặc định lấy từ catalog (checklists.js); admin
// override từng checklist, LƯU localStorage theo thiết bị (không có DB cho mục
// này) — logic thuần đã test ở lib/checklistFrequency & lib/frequencies.

import { useState } from "react";
import { Timer, RotateCcw, Info } from "lucide-react";
import { CHECKLISTS } from "../../lib/checklists";
import { FREQUENCIES, getFrequencyById } from "../../lib/frequencies";
import {
  loadFrequencyOverrides,
  setChecklistFrequency,
  resolveFrequencyId,
} from "../../lib/checklistFrequency";

export default function ChecklistFrequencyPanel({ flash }) {
  const [overrides, setOverrides] = useState(() => loadFrequencyOverrides());

  const apply = (checklist, freqId) => {
    const next = setChecklistFrequency(checklist.id, freqId);
    setOverrides({ ...next });
    const label = getFrequencyById(resolveFrequencyId(checklist, next))?.label || "mặc định";
    flash(true, `Tần suất ${checklist.title}: ${label}`);
  };

  const reset = (checklist) => {
    const next = setChecklistFrequency(checklist.id, ""); // gỡ override → về mặc định catalog
    setOverrides({ ...next });
    const label = getFrequencyById(resolveFrequencyId(checklist, next))?.label || "mặc định";
    flash(true, `${checklist.title} về mặc định (${label})`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Timer className="w-4 h-4" aria-hidden />
          Tần suất ghi thông số
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden />
          Quy định mỗi checklist cần ghi thông số bao lâu 1 lần. Ảnh hưởng cảnh báo
          "chưa kiểm tra" ở Trang chủ. Lưu trên thiết bị này.
        </p>
      </div>

      <div className="space-y-2">
        {CHECKLISTS.map((c) => {
          const effective = resolveFrequencyId(c, overrides);
          const isOverride = Boolean(overrides[c.id]);
          return (
            <div
              key={c.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {c.title}
                </span>
                {isOverride ? (
                  <button
                    onClick={() => reset(c)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1 rounded-lg active:bg-slate-100 dark:active:bg-slate-700 flex-shrink-0"
                    aria-label={`Đặt lại ${c.title} về mặc định`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                    Mặc định
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex-shrink-0">
                    Mặc định
                  </span>
                )}
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {FREQUENCIES.map((f) => {
                  const on = f.id === effective;
                  return (
                    <button
                      key={f.id}
                      onClick={() => apply(c, f.id)}
                      aria-pressed={on}
                      className={`px-3 min-h-[40px] rounded-lg text-sm font-semibold border transition-colors ${
                        on
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
