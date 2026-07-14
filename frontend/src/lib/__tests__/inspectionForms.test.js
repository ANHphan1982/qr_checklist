import { describe, it, expect } from "vitest";
import {
  getInspectionForm,
  buildInspectionFormRows,
  FORM_TABLE_HEADER_ROW,
} from "../inspectionForms";

// ---------------------------------------------------------------------------
// getInspectionForm — catalog form mẫu kiểm tra theo checklist id (TDD)
// Form theo định dạng BSR-INS-WI-007-F001 (E-Tankage external checklist):
// bảng Stt | Hạng mục | Fact & Finding | Đánh giá (4 cột con) | Ghi chú,
// chia section (1, 2...) với item con (1.1, 1.2...), cuối form là khối chữ ký.
// Form dùng CHUNG cho mọi trạm của checklist (giống Tank check list) — không
// gắn với trạm cụ thể, có dòng "Trạm/ Station:" điền tay.
// ---------------------------------------------------------------------------
describe("getInspectionForm", () => {
  it("checklist 'elec' có form mẫu", () => {
    const form = getInspectionForm("elec");
    expect(form).toBeTruthy();
    expect(form.title).toBeTruthy();
    expect(Array.isArray(form.sections)).toBe(true);
    expect(form.sections.length).toBeGreaterThan(0);
  });

  it("mỗi section có số thứ tự, tiêu đề và item đánh số x.y", () => {
    const form = getInspectionForm("elec");
    const sec = form.sections[0];
    expect(sec.no).toBe("1");
    expect(sec.title).toBeTruthy();
    expect(sec.items.length).toBeGreaterThan(0);
    expect(sec.items[0].no).toBe("1.1");
    expect(sec.items[0].label).toBeTruthy();
  });

  it("form không gắn trạm cụ thể (dùng chung mọi trạm của checklist)", () => {
    const form = getInspectionForm("elec");
    expect(form.station).toBeUndefined();
    expect(form.station_name).toBeUndefined();
  });

  it("checklist chưa có form → undefined", () => {
    expect(getInspectionForm("routine")).toBeUndefined();
  });

  it("id rỗng/null → undefined", () => {
    expect(getInspectionForm("")).toBeUndefined();
    expect(getInspectionForm(null)).toBeUndefined();
    expect(getInspectionForm(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildInspectionFormRows — dựng array-of-arrays theo layout file .doc mẫu
//
// Layout (0-based):
//   row 0: tiêu đề form
//   row 1: "Trạm/ Station:" (điền tay — form dùng chung mọi trạm)
//   row 2: (trống)
//   row 3: header tầng 1: Stt | Hạng mục | Fact & Finding | Đánh giá | ... | Ghi chú
//   row 4: header tầng 2: cột con Đánh giá: No abnormal | Abnormal | Acc | Not Acc
//   row 5+: section rows + item rows
//   ...: (trống) + khối chữ ký: Inspected by / Reviewed by, Signature, Date
// ---------------------------------------------------------------------------
describe("buildInspectionFormRows", () => {
  const form = {
    title: "TEST CHECKLIST",
    sections: [
      { no: "1", title: "Phần một/ Section one", items: [
        { no: "1.1", label: "Mục 1.1/ Item 1.1" },
        { no: "1.2", label: "Mục 1.2/ Item 1.2" },
      ]},
      { no: "2", title: "Phần hai/ Section two", items: [
        { no: "2.1", label: "Mục 2.1/ Item 2.1" },
      ]},
    ],
  };

  it("row 0 là tiêu đề form", () => {
    const rows = buildInspectionFormRows(form);
    expect(rows[0][0]).toBe("TEST CHECKLIST");
  });

  it("row 1 có nhãn 'Trạm/ Station:' để điền tay", () => {
    const rows = buildInspectionFormRows(form);
    expect(rows[1][0]).toBe("Trạm/ Station:");
  });

  it("header tầng 1 đúng cột theo file mẫu (Đánh giá gộp 4 cột con)", () => {
    const rows = buildInspectionFormRows(form);
    const h1 = rows[FORM_TABLE_HEADER_ROW];
    expect(h1[0]).toBe("Stt/ No");
    expect(h1[1]).toBe("Các hạng mục kiểm tra/ Inspection Items");
    expect(h1[2]).toBe("Nội dung ghi nhận hiện trường/ Fact & Finding");
    expect(h1[3]).toBe("Đánh giá/ Judgement");
    expect(h1[7]).toBe("Ghi chú/ Remark");
  });

  it("header tầng 2 là 4 cột con của Đánh giá", () => {
    const rows = buildInspectionFormRows(form);
    const h2 = rows[FORM_TABLE_HEADER_ROW + 1];
    expect(h2[3]).toBe("No abnormal");
    expect(h2[4]).toBe("Abnormal");
    expect(h2[5]).toBe("Acc");
    expect(h2[6]).toBe("Not Acc");
  });

  it("section row: chỉ có Stt + tiêu đề section", () => {
    const rows = buildInspectionFormRows(form);
    const secRow = rows[FORM_TABLE_HEADER_ROW + 2];
    expect(secRow[0]).toBe("1");
    expect(secRow[1]).toBe("Phần một/ Section one");
  });

  it("item row: Stt x.y + nhãn, các ô đánh giá/ghi chú để trống điền tay", () => {
    const rows = buildInspectionFormRows(form);
    const itemRow = rows[FORM_TABLE_HEADER_ROW + 3];
    expect(itemRow[0]).toBe("1.1");
    expect(itemRow[1]).toBe("Mục 1.1/ Item 1.1");
    // fact&finding + 4 ô judgement + ghi chú trống
    for (let c = 2; c <= 7; c++) expect(itemRow[c] ?? "").toBe("");
  });

  it("đủ mọi section và item theo thứ tự khai báo", () => {
    const rows = buildInspectionFormRows(form);
    const sttCol = rows.map((r) => r[0]);
    const i11 = sttCol.indexOf("1.1");
    const i12 = sttCol.indexOf("1.2");
    const i2  = sttCol.indexOf("2");
    const i21 = sttCol.indexOf("2.1");
    expect(i11).toBeGreaterThan(-1);
    expect(i12).toBe(i11 + 1);
    expect(i2).toBe(i12 + 1);
    expect(i21).toBe(i2 + 1);
  });

  it("cuối form có khối chữ ký Inspected by / Reviewed by, Signature, Date", () => {
    const rows = buildInspectionFormRows(form);
    const flat = rows.map((r) => (r[0] ?? "") + "|" + (r[4] ?? ""));
    expect(flat).toContain("Người kiểm tra/ Inspected by|Người xem xét/ Reviewed by");
    expect(flat).toContain("Chữ ký/ Signature|Chữ ký/ Signature");
    expect(flat).toContain("Ngày/ Date|Ngày/ Date");
  });

  it("khối chữ ký nằm SAU dòng item cuối cùng", () => {
    const rows = buildInspectionFormRows(form);
    const lastItemIdx = rows.map((r) => r[0]).indexOf("2.1");
    const signIdx = rows.map((r) => r[0]).indexOf("Người kiểm tra/ Inspected by");
    expect(signIdx).toBeGreaterThan(lastItemIdx);
  });

  it("form elec thật dựng được rows không lỗi", () => {
    const rows = buildInspectionFormRows(getInspectionForm("elec"));
    expect(rows.length).toBeGreaterThan(FORM_TABLE_HEADER_ROW + 2);
  });
});
