/**
 * TDD — resolveParamStatus
 * Logic: validate giá trị thông số vận hành và trả về trạng thái + màu.
 */
import { describe, it, expect } from "vitest";
import { resolveParamStatus } from "../paramStatus.js";

describe("resolveParamStatus — empty / invalid input", () => {
  it("returns empty for empty string", () => {
    expect(resolveParamStatus("", 50, 80).status).toBe("empty");
  });

  it("returns empty for null", () => {
    expect(resolveParamStatus(null, 50, 80).status).toBe("empty");
  });

  it("returns empty for undefined", () => {
    expect(resolveParamStatus(undefined, 50, 80).status).toBe("empty");
  });

  it("returns empty for non-numeric string", () => {
    expect(resolveParamStatus("abc", 50, 80).status).toBe("empty");
  });

  it("empty state has neutral color", () => {
    expect(resolveParamStatus("", 50, 80).color).toBe("neutral");
  });

  it("empty state has null message", () => {
    expect(resolveParamStatus("", 50, 80).message).toBeNull();
  });
});

describe("resolveParamStatus — within range (normal)", () => {
  it("returns normal for value exactly at low boundary", () => {
    expect(resolveParamStatus("50", 50, 80).status).toBe("normal");
  });

  it("returns normal for value exactly at high boundary", () => {
    expect(resolveParamStatus("80", 50, 80).status).toBe("normal");
  });

  it("returns normal for value in the middle of range", () => {
    expect(resolveParamStatus("65", 50, 80).status).toBe("normal");
  });

  it("normal state has success color", () => {
    expect(resolveParamStatus("65", 50, 80).color).toBe("success");
  });

  it("normal state has null message", () => {
    expect(resolveParamStatus("65", 50, 80).message).toBeNull();
  });
});

describe("resolveParamStatus — out of range (warning)", () => {
  it("returns warning when value below low", () => {
    expect(resolveParamStatus("30", 50, 80).status).toBe("warning");
  });

  it("returns warning when value above high", () => {
    expect(resolveParamStatus("100", 50, 80).status).toBe("warning");
  });

  it("warning state has warning color", () => {
    expect(resolveParamStatus("30", 50, 80).color).toBe("warning");
  });

  it("warning message mentions the valid range", () => {
    const { message } = resolveParamStatus("30", 50, 80);
    expect(message).toBeTruthy();
    expect(message).toMatch(/50/);
    expect(message).toMatch(/80/);
  });

  it("decimal value below low is warning", () => {
    expect(resolveParamStatus("49.9", 50, 80).status).toBe("warning");
  });

  it("decimal value above high is warning", () => {
    expect(resolveParamStatus("80.1", 50, 80).status).toBe("warning");
  });
});

describe("resolveParamStatus — no range provided", () => {
  it("returns normal when low=null and high=null", () => {
    const result = resolveParamStatus("42", null, null);
    expect(result.status).toBe("normal");
  });

  it("returns normal when low=undefined and high=undefined", () => {
    const result = resolveParamStatus("42", undefined, undefined);
    expect(result.status).toBe("normal");
  });

  it("returns normal when only low is missing", () => {
    const result = resolveParamStatus("30", null, 80);
    expect(result.status).toBe("normal");
  });

  it("returns normal when only high is missing", () => {
    const result = resolveParamStatus("100", 50, null);
    expect(result.status).toBe("normal");
  });
});

describe("resolveParamStatus — numeric string vs number input", () => {
  it("handles numeric string '65' correctly", () => {
    expect(resolveParamStatus("65", 50, 80).status).toBe("normal");
  });

  it("handles numeric number 65 correctly", () => {
    expect(resolveParamStatus(65, 50, 80).status).toBe("normal");
  });

  it("handles zero value", () => {
    // 0 is below range 50-80 → warning
    expect(resolveParamStatus("0", 50, 80).status).toBe("warning");
  });

  it("handles negative value with no range → normal", () => {
    expect(resolveParamStatus("-5", null, null).status).toBe("normal");
  });
});
