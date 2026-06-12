/**
 * TDD — resolveButtonState
 * Logic: trả về trạng thái nút Scan tại mỗi bước — loading ngay khi tap.
 */
import { describe, it, expect } from "vitest";
import { resolveButtonState } from "../buttonState.js";

describe("resolveButtonState — idle", () => {
  it("shows primary scan button when idle", () => {
    const s = resolveButtonState("idle");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("primary");
    expect(s.loading).toBe(false);
    expect(s.label).toMatch(/Scan/i);
  });
});

describe("resolveButtonState — permission (GPS check)", () => {
  it("shows loading state immediately when checking GPS permission", () => {
    const s = resolveButtonState("permission");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("primary");
    expect(s.loading).toBe(true);
  });

  it("permission label mentions GPS", () => {
    const s = resolveButtonState("permission");
    expect(s.label).toMatch(/GPS/i);
  });
});

describe("resolveButtonState — scanning", () => {
  it("shows secondary stop button when scanning", () => {
    const s = resolveButtonState("scanning");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("secondary");
    expect(s.loading).toBe(false);
  });

  it("scanning label mentions dừng or stop", () => {
    const s = resolveButtonState("scanning");
    expect(s.label).toMatch(/Dừng|Camera/i);
  });
});

describe("resolveButtonState — gps", () => {
  it("shows loading state while getting GPS fix", () => {
    const s = resolveButtonState("gps");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("primary");
    expect(s.loading).toBe(true);
  });
});

describe("resolveButtonState — sending", () => {
  it("shows loading state while sending to API", () => {
    const s = resolveButtonState("sending");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("primary");
    expect(s.loading).toBe(true);
  });
});

describe("resolveButtonState — params", () => {
  it("hides button when showing params modal", () => {
    const s = resolveButtonState("params");
    expect(s.show).toBe(false);
  });
});

describe("resolveButtonState — done", () => {
  it("shows primary scan-again button when done", () => {
    const s = resolveButtonState("done");
    expect(s.show).toBe(true);
    expect(s.variant).toBe("primary");
    expect(s.loading).toBe(false);
    expect(s.label).toMatch(/Quét/i);
  });
});

describe("resolveButtonState — unknown step", () => {
  it("hides button for unknown step", () => {
    const s = resolveButtonState("whatever");
    expect(s.show).toBe(false);
  });
});

describe("resolveButtonState — icon field thay emoji trong label", () => {
  it("idle và done dùng icon camera", () => {
    expect(resolveButtonState("idle").icon).toBe("camera");
    expect(resolveButtonState("done").icon).toBe("camera");
  });

  it("scanning dùng icon stop", () => {
    expect(resolveButtonState("scanning").icon).toBe("stop");
  });

  it("các bước loading không có icon (spinner đã hiển thị)", () => {
    expect(resolveButtonState("permission").icon).toBeNull();
    expect(resolveButtonState("gps").icon).toBeNull();
    expect(resolveButtonState("sending").icon).toBeNull();
  });

  const allSteps = ["idle", "permission", "scanning", "gps", "sending", "done"];
  it.each(allSteps)("label của step '%s' không chứa emoji", (step) => {
    const { label } = resolveButtonState(step);
    // Emoji & symbols nằm ngoài BMP latin — regex bắt các block emoji phổ biến
    expect(label).not.toMatch(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}]/u);
  });
});

describe("resolveButtonState — loading states are exclusive to busy steps", () => {
  const nonLoadingSteps = ["idle", "scanning", "done"];
  const loadingSteps = ["permission", "gps", "sending"];

  it.each(nonLoadingSteps)("step '%s' is NOT loading", (step) => {
    expect(resolveButtonState(step).loading).toBe(false);
  });

  it.each(loadingSteps)("step '%s' IS loading", (step) => {
    expect(resolveButtonState(step).loading).toBe(true);
  });
});
