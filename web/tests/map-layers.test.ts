import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { aggregateCells, anomalyBadge, cellCategory, frpClass, frpQuartiles, frpRadius } from "../lib/map-layers";
import type { Detection, HexCell } from "../lib/types";

const cell = (lat: number, lon: number, value: number, modis: number, viirs: number): HexCell =>
  ({ cell_id: latLngToCell(lat, lon, 6), lat, lon, value, fire_days: 1, modis_count: modis, viirs_count: viirs }) as HexCell;

describe("anomaly label", () => {
  it("collapses the five API categories into three badges", () => {
    expect(anomalyBadge("muito_abaixo")).toBe("Abaixo");
    expect(anomalyBadge("abaixo")).toBe("Abaixo");
    expect(anomalyBadge("normal")).toBe("Normal");
    expect(anomalyBadge("acima")).toBe("Acima");
    expect(anomalyBadge("muito_acima")).toBe("Acima");
    expect(anomalyBadge("indisponivel")).toBe("Indisponível");
    expect(anomalyBadge(null)).toBe("Indisponível");
  });
});

describe("density aggregation", () => {
  const cells = [cell(-10, -48, 10, 2, 8), cell(-10.01, -48.01, 5, 0, 5), cell(-12, -46, 3, 3, 0)];
  it("filters by category", () => {
    expect(aggregateCells(cells, 6, "todos", "modis").map((c) => c.value)).toEqual([3]);
    expect(aggregateCells(cells, 6, "todos", "coincidentes").map((c) => c.value)).toEqual([10]);
  });
  it("uses the sensor count when a sensor is selected", () => {
    expect(aggregateCells(cells, 6, "modis", "todas").map((c) => c.value)).toEqual([3, 2]);
  });
  it("sums children into parents and ranks percentiles", () => {
    const a = aggregateCells(cells, 4, "todos", "todas");
    expect(a.reduce((s, c) => s + c.value, 0)).toBe(18);
    expect(a[0].percentile).toBe(100);
    expect(a.every((c, i) => i === 0 || a[i - 1].value >= c.value)).toBe(true);
  });
  it("cell category", () => {
    expect(cellCategory(1, 1)).toBe("coincidentes");
    expect(cellCategory(1, 0)).toBe("modis");
    expect(cellCategory(0, 2)).toBe("viirs");
  });
});

describe("FRP classes", () => {
  it("are per sensor quartiles and the radius is clamped", () => {
    const det = [1, 2, 3, 4, 5, 6, 7, 8].map((frp) => ({ sensor_family: "VIIRS", frp }) as Detection);
    const q = frpQuartiles(det).VIIRS;
    expect(q).toHaveLength(3);
    expect(frpClass(1, q)).toBe("baixa");
    expect(frpClass(8, q)).toBe("muito_alta");
    expect(frpClass(null, q)).toBeNull();
    expect(frpRadius(0)).toBe(3);
    expect(frpRadius(1e6)).toBe(10);
  });
});
