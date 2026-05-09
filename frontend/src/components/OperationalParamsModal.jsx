import { useState } from "react";

export default function OperationalParamsModal({ location, config, onSubmit, onSkip }) {
  const [value, setValue] = useState("");

  const label = config?.param_label || "Thông số";
  const unit  = config?.param_unit  || "mm";

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = value.trim();
    onSubmit({ oil_level_mm: v !== "" ? parseFloat(v) : null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-xl flex flex-col gap-5">

        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Thông số vận hành
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Trạm: <span className="font-semibold text-slate-700 dark:text-slate-200">{location}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="op-param-input"
              className="text-base font-medium text-slate-700 dark:text-slate-200"
            >
              {label} ({unit})
            </label>
            <input
              id="op-param-input"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Nhập ${label}...`}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: "16px" }}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-base active:bg-slate-100 dark:active:bg-slate-600 transition-colors min-h-[48px]"
            >
              Bỏ qua
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 transition-colors min-h-[48px]"
            >
              Lưu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
