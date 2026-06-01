/**
 * TDD — resolveStepDisplay
 * Logic: simplified step indicator — chỉ hiện label + progress% khi đang active.
 * Ẩn khi idle hoặc done.
 */
import { describe, it, expect } from "vitest";
import { resolveStepDisplay } from "../stepDisplay.js";

describe("resolveStepDisplay — hidden states", () => {
  it("hides when step=idle", () => {
    expect(resolveStepDisplay("idle").shouldShow).toBe(false);
  });

  it("hides when step=done", () => {
    expect(resolveStepDisplay("done").shouldShow).toBe(false);
  });

  it("hides for unknown step", () => {
    expect(resolveStepDisplay("unknown_step").shouldShow).toBe(false);
  });
});

describe("resolveStepDisplay — active steps are visible", () => {
  const activeSteps = ["permission", "scanning", "gps", "sending", "params"];

  it.each(activeSteps)("step '%s' should show", (step) => {
    expect(resolveStepDisplay(step).shouldShow).toBe(true);
  });
});

describe("resolveStepDisplay — labels", () => {
  it("permission has a label mentioning GPS", () => {
    const { label } = resolveStepDisplay("permission");
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
  });

  it("scanning has a label", () => {
    const { label } = resolveStepDisplay("scanning");
    expect(label).toBeTruthy();
  });

  it("gps has a label mentioning vị trí or GPS", () => {
    const { label } = resolveStepDisplay("gps");
    expect(label).toBeTruthy();
  });

  it("sending has a label", () => {
    const { label } = resolveStepDisplay("sending");
    expect(label).toBeTruthy();
  });

  it("params has a label", () => {
    const { label } = resolveStepDisplay("params");
    expect(label).toBeTruthy();
  });
});

describe("resolveStepDisplay — progress percentage", () => {
  it("permission has lowest progress (first active step)", () => {
    const { progressPct } = resolveStepDisplay("permission");
    expect(progressPct).toBeGreaterThan(0);
    expect(progressPct).toBeLessThanOrEqual(25);
  });

  it("params has near-complete progress (second-to-last step)", () => {
    const { progressPct } = resolveStepDisplay("params");
    expect(progressPct).toBeGreaterThan(70);
    expect(progressPct).toBeLessThan(100);
  });

  it("progress increases monotonically through the flow", () => {
    const flow = ["permission", "scanning", "gps", "sending", "params"];
    const pcts = flow.map((s) => resolveStepDisplay(s).progressPct);
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i]).toBeGreaterThan(pcts[i - 1]);
    }
  });

  it("progressPct is always 0-100", () => {
    const allSteps = ["idle", "permission", "scanning", "gps", "sending", "params", "done"];
    for (const step of allSteps) {
      const { progressPct } = resolveStepDisplay(step);
      expect(progressPct).toBeGreaterThanOrEqual(0);
      expect(progressPct).toBeLessThanOrEqual(100);
    }
  });
});
