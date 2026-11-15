import { describe, expect, it } from "vitest";
import { cacheKey } from "@/lib/api";
import { cellValue, granularity, periodRange } from "@/lib/filters";
import { detectLang, langFromCountry } from "@/lib/i18n";
import { classColors, classOf, quantileBreaks } from "@/lib/palettes";
import { fmtInt, fmtNum, tpl } from "@/lib/format";
import { BUNDLES } from "@/content";

describe("filters", () => {
  it("resolves periods inside the data range", () => {
    expect(periodRange("30d", "2003-01-01", "2026-11-14")).toEqual(["2026-10-16", "2026-11-14"]);
    expect(periodRange("serie", "2003-01-01", "2026-11-14")).toEqual(["2003-01-01", "2026-11-14"]);
    expect(periodRange("1d", "2003-01-01", "2026-11-14")).toEqual(["2026-11-14", "2026-11-14"]);
  });
  it("picks granularity from the daily window", () => {
    expect(granularity("2026-10-01", "2025-11-15")).toBe("Diário");
    expect(granularity("2020-01-01", "2025-11-15")).toBe("Mensal");
  });
  it("applies sensor and category filters", () => {
    const c = { value: 5, modis_count: 3, viirs_count: 0 };
    expect(cellValue(c, "todos", "todas")).toBe(5);
    expect(cellValue(c, "viirs", "todas")).toBeNull();
    expect(cellValue(c, "todos", "coincidentes")).toBeNull();
    expect(cellValue(c, "modis", "modis")).toBe(3);
  });
});

describe("palettes", () => {
  it("returns n colors, reversed when inverted", () => {
    const a = classColors("inferno", 5), b = classColors("inferno", 5, true);
    expect(a).toHaveLength(5);
    expect(b).toEqual([...a].reverse());
  });
  it("classifies by quantile breaks", () => {
    const br = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(br).toHaveLength(4);
    expect(classOf(1, br)).toBe(0);
    expect(classOf(10, br)).toBe(4);
  });
});

describe("api cache key", () => {
  it("ignores param order and empty values", () => {
    expect(cacheKey("/x", { b: 1, a: 2, c: "" })).toBe(cacheKey("/x", { a: 2, b: 1 }));
  });
});

describe("i18n", () => {
  it("Brazil gets pt, elsewhere en, cookie wins", () => {
    expect(langFromCountry("BR")).toBe("pt");
    expect(langFromCountry("US")).toBe("en");
    expect(langFromCountry("XX")).toBeNull();
    expect(detectLang({ cookie: "en", country: "BR" })).toBe("en");
    expect(detectLang({ acceptLanguage: "pt-BR,en;q=0.8" })).toBe("pt");
  });
  it("both bundles expose the same top-level keys", () => {
    expect(Object.keys(BUNDLES.en).sort()).toEqual(Object.keys(BUNDLES.pt).sort());
  });
});

describe("format", () => {
  it("uses locale separators and the typographic minus", () => {
    expect(fmtInt(12698833, "pt")).toBe("12.698.833");
    expect(fmtInt(12698833, "en")).toBe("12,698,833");
    expect(fmtNum(-26, "pt", 1)).toBe("−26,0");
    expect(tpl("{a} to {b}", { a: 1, b: 2 })).toBe("1 to 2");
  });
});
