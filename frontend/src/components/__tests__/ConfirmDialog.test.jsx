/**
 * TDD — ConfirmDialog (thay window.confirm cho đồng nhất UI)
 */
import { describe, it, expect } from "vitest";
import ConfirmDialog from "../ConfirmDialog";

describe("ConfirmDialog", () => {
  it("is a function (renderable component)", () => {
    expect(typeof ConfirmDialog).toBe("function");
  });

  it("returns null when open=false (không render gì)", () => {
    expect(ConfirmDialog({ open: false, title: "t", message: "m" })).toBeNull();
  });
});
