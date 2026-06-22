/**
 * TDD — ChecklistArt: valve/safety/elec dùng ảnh sản phẩm thay icon lucide.
 * Test kiểm: 3 loại này nằm trong IMAGE_ART (nền ô trắng) và component render <img>.
 */
import { describe, it, expect } from "vitest";
import { CHECKLIST_ART, IMAGE_ART } from "../ChecklistArt";

describe("ChecklistArt — ảnh sản phẩm cho valve/safety/elec", () => {
  for (const id of ["valve", "safety", "elec"]) {
    it(`'${id}' nằm trong IMAGE_ART (ô nền trắng)`, () => {
      expect(IMAGE_ART.has(id)).toBe(true);
    });

    it(`CHECKLIST_ART['${id}'] render thẻ <img>`, () => {
      const Art = CHECKLIST_ART[id];
      const el = Art();
      expect(el.type).toBe("img");
      expect(typeof el.props.src).toBe("string");
      expect(el.props.src.length).toBeGreaterThan(0);
    });
  }

  it("giữ nguyên ảnh sẵn có pump/tank/routine", () => {
    for (const id of ["pump", "tank", "routine"]) {
      expect(IMAGE_ART.has(id)).toBe(true);
      expect(CHECKLIST_ART[id]().type).toBe("img");
    }
  });
});
