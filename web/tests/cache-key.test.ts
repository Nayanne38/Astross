import { describe, expect, it } from "vitest";
import { cacheKey } from "../lib/api";

// Must match scripts/cache_api.py (cache_key). Expected names below are what the script writes.
describe("cacheKey", () => {
  it("matches the Python snapshot names", () => {
    expect(cacheKey("/meta")).toBe("meta");
    expect(cacheKey("/calendar", { region: "matopiba", start: undefined, end: undefined, top_n: 3, learn: true }))
      .toBe("calendar__learn-true_region-matopiba_top_n-3");
    expect(cacheKey("/hexgrid", { region: "matopiba", start: "2026-11-14", end: "2026-11-14", boundary: false, limit: 1, learn: false }))
      .toBe("hexgrid__boundary-false_end-2026-11-14_learn-false_limit-1_region-matopiba_start-2026-11-14");
    expect(cacheKey("/summary", { region: "m", bbox: "-48.5,-10.5,-47.5,-9.5", learn: false }))
      .toBe("summary__bbox--485-105-475-95_learn-false_region-m");
  });
});
