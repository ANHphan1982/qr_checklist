import { describe, it, expect } from "vitest";
import { toastReducer, MAX_TOASTS } from "../toastReducer";

describe("toastReducer", () => {
  it("add: thêm toast vào cuối danh sách", () => {
    const s = toastReducer([], { type: "add", toast: { id: 1, type: "success", message: "ok" } });
    expect(s).toHaveLength(1);
    expect(s[0].message).toBe("ok");
  });

  it("remove: xóa đúng toast theo id", () => {
    const start = [{ id: 1, message: "a" }, { id: 2, message: "b" }];
    const s = toastReducer(start, { type: "remove", id: 1 });
    expect(s.map((t) => t.id)).toEqual([2]);
  });

  it("remove id không tồn tại → giữ nguyên", () => {
    const start = [{ id: 1 }];
    expect(toastReducer(start, { type: "remove", id: 99 })).toEqual(start);
  });

  it("giới hạn MAX_TOASTS, bỏ cái cũ nhất khi tràn", () => {
    let s = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) {
      s = toastReducer(s, { type: "add", toast: { id: i, message: `t${i}` } });
    }
    expect(s).toHaveLength(MAX_TOASTS);
    // cái cũ nhất (id 1, 2) bị đẩy ra
    expect(s[0].id).toBe(3);
  });

  it("clear: xóa hết", () => {
    expect(toastReducer([{ id: 1 }, { id: 2 }], { type: "clear" })).toEqual([]);
  });

  it("action lạ → giữ nguyên state", () => {
    const start = [{ id: 1 }];
    expect(toastReducer(start, { type: "noop" })).toBe(start);
  });
});
