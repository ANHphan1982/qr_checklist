// checklists — catalog tĩnh các loại checklist (id, tiêu đề, mô tả, hình minh
// họa, màu nhấn, số trạm/mục danh nghĩa). Tách khỏi HomePage để các trang khác
// (ScanPage, admin) dùng chung mà không phải import chéo từ page.
//
// ⚠️ `stations`/`items` ở đây chỉ là số catalog danh nghĩa — tiến độ THẬT lấy từ
// coverage trong ca (xem checklistCoverage). Đừng dùng số này làm nguồn sự thật.
//
// `frequency` = tần suất ghi thông số MẶC ĐỊNH (id trong lib/frequencies.js).
// Admin có thể override từng checklist qua panel "Tần suất" (lưu localStorage).
// Mặc định "shift" giữ đúng hành vi cũ (1 lần/ca).

export const CHECKLISTS = [
  { id: "pump",    title: "Pump Check List",       desc: "Kiểm tra bơm & động cơ",     stations: 6, items: 24, art: "pump",    accent: "blue",    frequency: "shift" },
  { id: "tank",    title: "Tank Check List",       desc: "Bồn chứa, mức & rò rỉ",      stations: 4, items: 18, art: "tank",    accent: "cyan",    frequency: "shift" },
  { id: "routine", title: "Routine Check List",    desc: "Tuần tra định kỳ hằng ngày", stations: 8, items: 32, art: "routine", accent: "emerald", frequency: "shift" },
  { id: "valve",   title: "Valve Check List",      desc: "Van & đường ống",            stations: 5, items: 15, art: "valve",   accent: "violet",  frequency: "shift" },
  { id: "safety",  title: "Safety Check List",     desc: "An toàn & PCCC",             stations: 7, items: 28, art: "safety",  accent: "amber",   frequency: "day"   },
  { id: "elec",    title: "Electrical Check List", desc: "Tủ điện & nguồn",            stations: 3, items: 12, art: "elec",    accent: "red",     frequency: "shift" },
];

/** Tra cứu checklist theo id; undefined nếu không tồn tại / id rỗng. */
export function getChecklistById(id) {
  if (!id) return undefined;
  return CHECKLISTS.find((c) => c.id === id);
}
