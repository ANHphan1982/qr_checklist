/**
 * TDD — OperationalParamsModal
 */
import { describe, it, expect, vi } from "vitest";
import { PARAM_STATIONS } from "../OperationalParamsModal";

// ---------------------------------------------------------------------------
// PARAM_STATIONS constant — which stations require operational params
// ---------------------------------------------------------------------------
describe("PARAM_STATIONS", () => {
  it("includes TK-5203A", () => {
    expect(PARAM_STATIONS.has("TK-5203A")).toBe(true);
  });

  it("includes TK-5205A", () => {
    expect(PARAM_STATIONS.has("TK-5205A")).toBe(true);
  });

  it("does not include unrelated stations", () => {
    expect(PARAM_STATIONS.has("TK-5201A")).toBe(false);
    expect(PARAM_STATIONS.has("Cổng A")).toBe(false);
    expect(PARAM_STATIONS.has("")).toBe(false);
  });
});
