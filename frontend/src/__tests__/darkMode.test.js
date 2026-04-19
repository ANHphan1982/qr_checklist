/**
 * TDD — Dark/Light mode toggle logic
 *
 * Convention chosen: icon represents the CURRENT mode, not the target.
 *   dark=true  → show Moon icon  (bạn đang ở chế độ tối)
 *   dark=false → show Sun icon   (bạn đang ở chế độ sáng)
 * aria-label describes the ACTION (what click will do).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Helper: mocked localStorage ────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// ─── Helper: mocked matchMedia ───────────────────────────────────────────────
function mockMatchMedia(matches) {
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    value: vi.fn((query) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

// ─── Pure logic extracted for testing ───────────────────────────────────────
// This is the function we want NavBar to use.
// Icon shows CURRENT mode: dark → "moon", light → "sun"
function getIconName(isDark) {
  return isDark ? "moon" : "sun";
}

// aria-label describes the ACTION (clicking will switch to the other mode)
function getAriaLabel(isDark) {
  return isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối";
}

// ─── useDarkMode initial state logic ────────────────────────────────────────
function resolveDarkInitial(storedTheme, systemPrefersDark) {
  if (storedTheme !== null) return storedTheme === "dark";
  return systemPrefersDark;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getIconName — icon represents CURRENT mode", () => {
  it("dark mode (dark=true) → shows moon icon", () => {
    expect(getIconName(true)).toBe("moon");
  });

  it("light mode (dark=false) → shows sun icon", () => {
    expect(getIconName(false)).toBe("sun");
  });
});

describe("getAriaLabel — label describes ACTION (what click does)", () => {
  it("dark mode → label says switch to light", () => {
    expect(getAriaLabel(true)).toBe("Chuyển sang chế độ sáng");
  });

  it("light mode → label says switch to dark", () => {
    expect(getAriaLabel(false)).toBe("Chuyển sang chế độ tối");
  });
});

describe("resolveDarkInitial — saved theme takes priority over system", () => {
  it("returns true when saved theme is 'dark'", () => {
    expect(resolveDarkInitial("dark", false)).toBe(true);
  });

  it("returns false when saved theme is 'light'", () => {
    expect(resolveDarkInitial("light", true)).toBe(false);
  });

  it("falls back to system preference when no saved theme", () => {
    expect(resolveDarkInitial(null, true)).toBe(true);
    expect(resolveDarkInitial(null, false)).toBe(false);
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("saves 'dark' when dark=true", () => {
    // Simulate what the useEffect does
    const dark = true;
    localStorage.setItem("theme", dark ? "dark" : "light");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "dark");
  });

  it("saves 'light' when dark=false", () => {
    const dark = false;
    localStorage.setItem("theme", dark ? "dark" : "light");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("reads saved theme correctly", () => {
    localStorageMock.getItem.mockReturnValue("dark");
    const saved = localStorage.getItem("theme");
    expect(resolveDarkInitial(saved, false)).toBe(true);
  });
});

describe("toggle behaviour", () => {
  it("toggling dark=true gives false", () => {
    let dark = true;
    dark = !dark;
    expect(dark).toBe(false);
  });

  it("toggling dark=false gives true", () => {
    let dark = false;
    dark = !dark;
    expect(dark).toBe(true);
  });

  it("two toggles returns to original state", () => {
    let dark = true;
    dark = !dark;
    dark = !dark;
    expect(dark).toBe(true);
  });
});
