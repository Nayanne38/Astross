import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, areaParams, filterRange, granularity, parseArea, parseFilters, serializeFilters } from "../lib/filters";
import { parseLatLon } from "../lib/map-bus";

describe("URL <-> filters", () => {
  it("defaults serialize to an empty query", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
  });
  it("round-trips every field", () => {
    const f = { ...DEFAULT_FILTERS, region: "matopiba", period: "custom" as const, start: "2025-01-01", end: "2025-03-31",
      palette: "cividis" as const, invert: true, classes: 7, layer: "focos" as const, sensor: "viirs" as const,
      category: "coincidentes" as const, frp: ["alta" as const, "baixa" as const], area: "bbox:-48,-11,-47,-10", cell: "8680000e7ffffff" };
    const back = parseFilters(new URLSearchParams(serializeFilters(f)));
    expect(back).toEqual({ ...f, frp: ["alta", "baixa"].sort((a, b) => ["baixa", "media", "alta", "muito_alta"].indexOf(a) - ["baixa", "media", "alta", "muito_alta"].indexOf(b)) });
  });
  it("rejects invalid values instead of trusting the URL", () => {
    const f = parseFilters(new URLSearchParams("classes=12&palette=rainbow&period=custom&start=2025-05-01&end=2025-01-01&layer=x&frp=huge,alta&area=bbox:1,2,3"));
    expect(f.classes).toBe(5);
    expect(f.palette).toBe("inferno");
    expect(f.period).toBe("serie");
    expect(f.start).toBeNull();
    expect(f.layer).toBe("densidade");
    expect(f.frp).toEqual(["alta"]);
    expect(f.area).toBeNull();
  });
  it("all four FRP classes means no FRP filter", () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, frp: ["baixa", "media", "alta", "muito_alta"] })).toBe("");
  });
});

describe("periods and areas", () => {
  it("computes preset ranges from the last data day", () => {
    expect(filterRange({ period: "30d", start: null, end: null }, "2026-11-14")).toEqual({ start: "2026-10-16", end: "2026-11-14" });
    expect(filterRange({ period: "1d", start: null, end: null }, "2026-11-14")).toEqual({ start: "2026-11-14", end: "2026-11-14" });
    expect(filterRange({ period: "serie", start: null, end: null }, "2026-11-14")).toEqual({});
  });
  it("granularity follows the API daily window", () => {
    expect(granularity("2026-01-01", "2025-11-15")).toBe("Diário");
    expect(granularity("2024-01-01", "2025-11-15")).toBe("Mensal");
    expect(granularity(undefined, "2025-11-15")).toBe("Mensal");
  });
  it("area strings map to API params", () => {
    expect(parseArea("bbox:-48, -11, -47, -10")).toBe("bbox:-48,-11,-47,-10");
    expect(parseArea("bbox:-47,-11,-48,-10")).toBeNull();
    expect(areaParams("poly:-48,-11;-47,-11;-47,-10")).toEqual({ polygon: "-48,-11;-47,-11;-47,-10" });
  });
  it("parses lat, lon search input", () => {
    expect(parseLatLon("-10.2, -48.3")).toEqual({ lat: -10.2, lon: -48.3 });
    expect(parseLatLon("-10,2; -48,3")).toEqual({ lat: -10.2, lon: -48.3 });
    expect(parseLatLon("Palmas")).toBeNull();
    expect(parseLatLon("95, 10")).toBeNull();
  });
});
