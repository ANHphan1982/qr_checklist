// ChecklistArt — hình minh họa cho từng loại checklist trên HomePage.
// Mỗi entry là 1 component không nhận props, render full khung art đã có ở
// HomePage. Tất cả loại hiện dùng ảnh sản phẩm (assets/checklists); IMAGE_ART
// giúp HomePage biết card nào là ảnh → đổi nền ô thành trắng cho ảnh nổi bật.

import pumpImg from "../assets/checklists/pump.png";
import tankImg from "../assets/checklists/tank.jpg";
import routineImg from "../assets/checklists/routine.png";
import valveImg from "../assets/checklists/valve.png";
import safetyImg from "../assets/checklists/safety.png";
import elecImg from "../assets/checklists/elec.png";

const IMG_CLASS = "w-full h-full object-contain drop-shadow-sm";

// Component ảnh — alt rỗng vì tiêu đề checklist ngay cạnh đã truyền tải nghĩa
// (ảnh mang tính trang trí, tránh đọc thừa với screen reader).
function imgArt(src) {
  return function Art() {
    return <img src={src} alt="" loading="lazy" draggable={false} className={IMG_CLASS} />;
  };
}

// Tập các checklist dùng ảnh thật (nền ô nên để trắng).
export const IMAGE_ART = new Set(["pump", "tank", "routine", "valve", "safety", "elec"]);

export const CHECKLIST_ART = {
  pump:    imgArt(pumpImg),
  tank:    imgArt(tankImg),
  routine: imgArt(routineImg),
  valve:   imgArt(valveImg),
  safety:  imgArt(safetyImg),
  elec:    imgArt(elecImg),
};

export default CHECKLIST_ART;
