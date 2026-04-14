/**
 * TDD — lib/utils.js
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "TestAgent/1.0" },
  writable: true,
});

import { getDeviceId, formatDateTime, cn } from "../utils.js";

// ---------------------------------------------------------------------------
// getDeviceId
// ---------------------------------------------------------------------------

describe("getDeviceId", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns a string", () => {
    expect(typeof getDeviceId()).toBe("string");
  });

  it("stores the id in localStorage on first call", () => {
    getDeviceId();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "device_id",
      expect.any(String)
    );
  });

  it("returns the same id on subsequent calls", () => {
    const id1 = getDeviceId();
    // Simulate localStorage returning the stored value
    localStorageMock.getItem.mockReturnValue(id1);
    const id2 = getDeviceId();
    expect(id1).toBe(id2);
  });

  it("does not call setItem if id already stored", () => {
    localStorageMock.getItem.mockReturnValue("existing-id");
    getDeviceId();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("id is non-empty", () => {
    const id = getDeviceId();
    expect(id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------

describe("formatDateTime", () => {
  it("returns empty string for null", () => {
    expect(formatDateTime(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateTime(undefined)).toBe("");
  });

  it("returns a formatted string for valid ISO", () => {
    const result = formatDateTime("2026-04-14T01:30:00.000Z"); // 08:30 VN
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains year 2026", () => {
    const result = formatDateTime("2026-04-14T01:30:00.000Z");
    expect(result).toContain("2026");
  });
});

// ---------------------------------------------------------------------------
// cn (class merger)
// ---------------------------------------------------------------------------

describe("cn", () => {
  it("merges two class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });

  it("returns empty string for all falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });

  it("handles single class", () => {
    expect(cn("only")).toBe("only");
  });
});
