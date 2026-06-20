// ChecklistArt — hình minh họa cho từng loại checklist trên HomePage.
// Mỗi entry là 1 component không nhận props, render full khung 60px (p-2)
// đã có tint nền ở HomePage. Dùng icon lucide-react (đã là dependency)
// để giữ đồng nhất với phần còn lại của app, không cần vendor SVG mới.

import { Gauge, Fuel, ClipboardCheck, Wrench, ShieldCheck, Zap } from "lucide-react";

const ART_CLASS = "w-full h-full";

export const CHECKLIST_ART = {
  pump:    () => <Gauge        className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
  tank:    () => <Fuel         className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
  routine: () => <ClipboardCheck className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
  valve:   () => <Wrench       className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
  safety:  () => <ShieldCheck  className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
  elec:    () => <Zap          className={ART_CLASS} strokeWidth={1.75} aria-hidden />,
};

export default CHECKLIST_ART;
