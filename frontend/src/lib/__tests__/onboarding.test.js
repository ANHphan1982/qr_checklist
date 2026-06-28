import { describe, it, expect, beforeEach } from "vitest";
import { shouldShowOnboarding, markOnboardingSeen } from "../onboarding";

describe("onboarding", () => {
  beforeEach(() => localStorage.clear());

  it("lần đầu (chưa từng xem) → shouldShowOnboarding=true", () => {
    expect(shouldShowOnboarding()).toBe(true);
  });

  it("sau khi markOnboardingSeen → không hiện lại", () => {
    markOnboardingSeen();
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("không crash khi localStorage lỗi (trả false an toàn)", () => {
    expect(() => markOnboardingSeen()).not.toThrow();
    expect(() => shouldShowOnboarding()).not.toThrow();
  });
});
