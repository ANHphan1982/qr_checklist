import { describe, it, expect } from "vitest";
import { CHECKLISTS, getChecklistById } from "../checklists";

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
