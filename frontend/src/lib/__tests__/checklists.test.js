import { describe, it, expect } from "vitest";
import { CHECKLISTS, getChecklistById } from "../checklists";
import { getFrequencyById } from "../frequencies";

describe("CHECKLISTS catalog", () => {
  it("là mảng không rỗng, mỗi mục có id + title", () => {
    expect(Array.isArray(CHECKLISTS)).toBe(true);
    expect(CHECKLISTS.length).toBeGreaterThan(0);
    for (const c of CHECKLISTS) {
      expect(c.id).toBeTruthy();
      expect(c.title).toBeTruthy();
    }
  });

  it("id là duy nhất", () => {
    const ids = CHECKLISTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mỗi mục có tần suất mặc định (frequency) hợp lệ", () => {
    for (const c of CHECKLISTS) {
      expect(c.frequency).toBeTruthy();
      expect(getFrequencyById(c.frequency)).toBeTruthy();
    }
  });

  it("pump mặc định mỗi ca (shift); safety mặc định mỗi ngày (day)", () => {
    expect(getChecklistById("pump").frequency).toBe("shift");
    expect(getChecklistById("safety").frequency).toBe("day");
  });
});

describe("getChecklistById", () => {
  it("trả đúng checklist theo id", () => {
    const c = getChecklistById("pump");
    expect(c).toBeTruthy();
    expect(c.id).toBe("pump");
  });

  it("trả undefined khi id không tồn tại", () => {
    expect(getChecklistById("khong-co")).toBeUndefined();
  });

  it("trả undefined khi id rỗng/null", () => {
    expect(getChecklistById("")).toBeUndefined();
    expect(getChecklistById(null)).toBeUndefined();
  });
});
