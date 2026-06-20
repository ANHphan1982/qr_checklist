// ChecklistArt — hình minh họa cho từng loại checklist trên HomePage.
// Mỗi entry là 1 component không nhận props, render full khung art đã có ở
// HomePage. Loại nào có ảnh thật (pump/tank/routine) thì dùng ảnh sản phẩm
// (assets/checklists); các loại chưa có ảnh dùng icon lucide-react cho gọn.
//
// IMAGE_ART giúp HomePage biết card nào là ảnh → đổi nền ô thành trắng cho
// ảnh nổi bật, card icon thì giữ nền tint màu.

import { Wrench, ShieldCheck, Zap } from "lucide-react";
import pumpImg from "../assets/checklists/pump.png";
import tankImg from "../assets/checklists/tank.jpg";
import routineImg from "../assets/checklists/routine.png";

const ICON_CLASS = "w-full h-full";
const IMG_CLASS = "w-full h-full object-contain drop-shadow-sm";

// Component ảnh — alt rỗng vì tiêu đề checklist ngay cạnh đã truyền tải nghĩa
// (ảnh mang tính trang trí, tránh đọc thừa với screen reader).
function imgArt(src) {
  return function Art() {
    return <img src={src} alt="" loading="lazy" draggable={false} className={IMG_CLASS} />;
  };
}

// Tập các checklist dùng ảnh thật (nền ô nên để trắng).
export const IMAGE_ART = new Set(["pump", "tank", "routine"]);

export const CHECKLIST_ART = {
  pump:    imgArt(pumpImg),
  tank:    imgArt(tankImg),
  routine: imgArt(routineImg),
  valve:   () => <Wrench      className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
  safety:  () => <ShieldCheck className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
  elec:    () => <Zap         className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
};

export default CHECKLIST_ART;
