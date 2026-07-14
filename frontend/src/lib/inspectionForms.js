// inspectionForms — catalog "form mẫu kiểm tra" theo checklist id, layout theo
// biểu mẫu BSR-INS-WI-007-F001 (E-Tankage external checklist): bảng
// Stt | Hạng mục kiểm tra | Fact & Finding | Đánh giá (No abnormal / Abnormal /
// Acc / Not Acc) | Ghi chú, chia section (1, 2...) với item con (1.1, 1.2...),
// cuối form là khối chữ ký Inspected by / Reviewed by.
//
// Form dùng CHUNG cho mọi trạm của checklist (giống Tank check list) — không
// gắn trạm cụ thể; dòng "Trạm/ Station:" để nhân viên điền tay khi in.
//
// File này thuần data + logic dựng rows (KHÔNG import xlsx) để HomePage import
// tĩnh mà không kéo xlsx (~800KB) vào bundle khởi động — sheet builder nằm ở
// exportExcel.js (nạp lười).
//
// Muốn sửa hạng mục kiểm tra: sửa trực tiếp INSPECTION_FORMS bên dưới.

export const INSPECTION_FORMS = {
  elec: {
    title: "PHIẾU KIỂM TRA THIẾT BỊ ĐIỆN/ ELECTRICAL EXTERNAL CHECKLIST",
    sections: [
      {
        no: "1",
        title: "Tủ điện/ Electrical cabinet",
        items: [
          { no: "1.1", label: "Vỏ tủ, cửa tủ và gioăng làm kín/ Cabinet enclosure, door and sealing gasket" },
          { no: "1.2", label: "Khóa cửa tủ và bản lề/ Door locks and hinges" },
          { no: "1.3", label: "Tình trạng sơn, ăn mòn/ Painting and corrosion condition" },
          { no: "1.4", label: "Đèn báo, đồng hồ hiển thị trên mặt tủ/ Indicator lamps and panel meters" },
          { no: "1.5", label: "Nhãn mác, biển cảnh báo/ Labels and warning signs" },
        ],
      },
      {
        no: "2",
        title: "Hệ thống dây dẫn & đấu nối/ Wiring & connections",
        items: [
          { no: "2.1", label: "Cáp động lực và cáp điều khiển/ Power and control cables" },
          { no: "2.2", label: "Ống luồn cáp, máng cáp/ Conduits and cable trays" },
          { no: "2.3", label: "Hộp đấu nối, gland cáp/ Junction boxes and cable glands" },
          { no: "2.4", label: "Dấu hiệu quá nhiệt, phóng điện/ Signs of overheating or arcing" },
        ],
      },
      {
        no: "3",
        title: "Tiếp địa & chống sét/ Grounding & lightning protection",
        items: [
          { no: "3.1", label: "Dây tiếp địa và điểm nối đất/ Grounding conductors and connections" },
          { no: "3.2", label: "Điện trở tiếp địa (nếu đo)/ Grounding resistance (if measured)" },
          { no: "3.3", label: "Kim thu sét, dây thoát sét/ Lightning rods and down conductors" },
        ],
      },
      {
        no: "4",
        title: "Chiếu sáng & thiết bị phụ trợ/ Lighting & auxiliary equipment",
        items: [
          { no: "4.1", label: "Đèn chiếu sáng khu vực/ Area lighting" },
          { no: "4.2", label: "Đèn sự cố/ Emergency lighting" },
          { no: "4.3", label: "Ổ cắm, công tắc/ Sockets and switches" },
        ],
      },
      {
        no: "5",
        title: "Động cơ & thiết bị điện quay/ Motors & rotating electrical equipment",
        items: [
          { no: "5.1", label: "Tiếng ồn, độ rung bất thường/ Abnormal noise and vibration" },
          { no: "5.2", label: "Nhiệt độ vỏ động cơ/ Motor body temperature" },
          { no: "5.3", label: "Quạt làm mát và lưới bảo vệ/ Cooling fan and guard" },
        ],
      },
    ],
  },
};

/** Tra cứu form mẫu theo checklist id; undefined nếu checklist chưa có form. */
export function getInspectionForm(checklistId) {
  if (!checklistId) return undefined;
  return INSPECTION_FORMS[checklistId];
}

// Header bảng nằm sau: tiêu đề (0) + Trạm/Station (1) + dòng trống (2).
export const FORM_TABLE_HEADER_ROW = 3;

// Số cột của bảng: Stt, Hạng mục, Fact&Finding, 4 cột Đánh giá, Ghi chú.
export const FORM_COLS = 8;

const EMPTY_FILL = ["", "", "", "", "", ""]; // C..H: các ô điền tay của item row

/**
 * Dựng array-of-arrays cho sheet form mẫu (đưa vào XLSX.utils.aoa_to_sheet).
 * Layout mirror biểu mẫu .doc: header 2 tầng (Đánh giá gộp 4 cột con),
 * section row chỉ có Stt + tiêu đề, item row để trống ô đánh giá/ghi chú,
 * cuối form là khối chữ ký 2 cột (Inspected by / Reviewed by).
 *
 * @param {{title: string, sections: Array<{no, title, items: Array<{no, label}>}>}} form
 * @returns {Array<Array<string|null>>}
 */
export function buildInspectionFormRows(form) {
  const rows = [
    [form.title],
    ["Trạm/ Station:"],
    [],
    [
      "Stt/ No",
      "Các hạng mục kiểm tra/ Inspection Items",
      "Nội dung ghi nhận hiện trường/ Fact & Finding",
      "Đánh giá/ Judgement",
      null,
      null,
      null,
      "Ghi chú/ Remark",
    ],
    [null, null, null, "No abnormal", "Abnormal", "Acc", "Not Acc", null],
  ];

  for (const sec of form.sections) {
    rows.push([sec.no, sec.title]);
    for (const item of sec.items) {
      rows.push([item.no, item.label, ...EMPTY_FILL]);
    }
  }

  rows.push([]);
  rows.push(["Người kiểm tra/ Inspected by", null, null, null, "Người xem xét/ Reviewed by"]);
  rows.push(["Chữ ký/ Signature", null, null, null, "Chữ ký/ Signature"]);
  rows.push(["Ngày/ Date", null, null, null, "Ngày/ Date"]);

  return rows;
}
