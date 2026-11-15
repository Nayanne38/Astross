// Pure helpers for the map layers (no React, no Leaflet): unit-tested in tests/map-layers.test.ts.
import { cellToParent, latLngToCell } from "h3-js";
import type { CategoryFilter, FrpClass, Sensor } from "./filters";
import type { Category, Detection, HexCell } from "./types";

/** Display resolution by zoom: res-6 cells (~36 km²) are 1–2 px wide when the whole region is visible. */
export function displayRes(zoom: number): 4 | 5 | 6 {
  return zoom < 6.5 ? 4 : zoom < 8 ? 5 : 6;
}
export const AREA_KM2: Record<number, string> = { 4: "1.770", 5: "253", 6: "36" };

export type CellCat = "modis" | "viirs" | "coincidentes";
export function cellCategory(modis: number, viirs: number): CellCat {
  return modis > 0 && viirs > 0 ? "coincidentes" : modis > 0 ? "modis" : "viirs";
}
export function matchesCategory(cat: CellCat, f: CategoryFilter): boolean {
  return f === "todas" || f === cat;
}

export interface AggCell { id: string; value: number; modis: number; viirs: number; fireDays: number; n: number; percentile: number }

/**
 * Density layer: filter cells by sensor/category, aggregate to the display resolution,
 * rank (percentile among the aggregated cells of the period) and sort by value (desc).
 * Sensor "modis"/"viirs" colors by that sensor's detection count; "todos" by harmonized cell-days.
 */
export function aggregateCells(cells: HexCell[], res: number, sensor: Sensor, category: CategoryFilter): AggCell[] {
  const agg = new Map<string, AggCell>();
  for (const c of cells) {
    if (!matchesCategory(cellCategory(c.modis_count, c.viirs_count), category)) continue;
    const v = sensor === "modis" ? c.modis_count : sensor === "viirs" ? c.viirs_count : c.value;
    if (!(v > 0)) continue;
    const k = res === 6 ? c.cell_id : cellToParent(c.cell_id, res);
    const a = agg.get(k) ?? { id: k, value: 0, modis: 0, viirs: 0, fireDays: 0, n: 0, percentile: 0 };
    a.value += v; a.modis += c.modis_count; a.viirs += c.viirs_count; a.fireDays += c.fire_days; a.n += 1;
    agg.set(k, a);
  }
  const out = [...agg.values()].sort((x, y) => y.value - x.value);
  const n = out.length;
  // percentile = share of cells with a value <= this one (ties share the same rank)
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && out[j + 1].value === out[i].value) j++;
    const p = n === 1 ? 100 : ((n - i) / n) * 100;
    for (let k = i; k <= j; k++) out[k].percentile = Math.round(p);
    i = j + 1;
  }
  return out;
}

/** Per-sensor FRP quartiles from the loaded detections (MODIS 1 km and VIIRS 375 m FRP are not comparable). */
export function frpQuartiles(det: Detection[]): Record<"MODIS" | "VIIRS", number[]> {
  const out = { MODIS: [] as number[], VIIRS: [] as number[] };
  for (const fam of ["MODIS", "VIIRS"] as const) {
    const v = det.filter((d) => d.sensor_family === fam && d.frp != null).map((d) => d.frp as number).sort((a, b) => a - b);
    out[fam] = v.length ? [0.25, 0.5, 0.75].map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]) : [];
  }
  return out;
}

export const FRP_ORDER: FrpClass[] = ["baixa", "media", "alta", "muito_alta"];
export function frpClass(frp: number | null | undefined, q: number[]): FrpClass | null {
  if (frp == null || q.length !== 3) return null;
  return frp <= q[0] ? "baixa" : frp <= q[1] ? "media" : frp <= q[2] ? "alta" : "muito_alta";
}

/** Marker radius in px: sqrt(FRP) scaled and clamped to 3..10. */
export function frpRadius(frp: number | null | undefined): number {
  if (frp == null || !(frp > 0)) return 3;
  return Math.max(3, Math.min(10, 2 + Math.sqrt(frp) * 0.8));
}

/** Category of each detection's H3 res-6 cell-day: only MODIS, only VIIRS or both sensors. */
export function detectionCategories(det: Detection[]): CellCat[] {
  const keys = det.map((d) => `${latLngToCell(d.lat, d.lon, 6)}|${d.date}`);
  const fam = new Map<string, number>(); // bit 1 = MODIS, bit 2 = VIIRS
  keys.forEach((k, i) => fam.set(k, (fam.get(k) ?? 0) | (det[i].sensor_family === "MODIS" ? 1 : 2)));
  return keys.map((k) => { const b = fam.get(k)!; return b === 3 ? "coincidentes" : b === 1 ? "modis" : "viirs"; });
}

/** Three-level badge for the anomaly card. Cut points (percentile of the same month in other years):
 *  Abaixo < 33 ≤ Normal ≤ 67 < Acima. The API category adds "muito" below 10 and above 90. */
export function anomalyBadge(c: Category | null | undefined): "Abaixo" | "Normal" | "Acima" | "Indisponível" {
  if (c === "muito_abaixo" || c === "abaixo") return "Abaixo";
  if (c === "normal") return "Normal";
  if (c === "acima" || c === "muito_acima") return "Acima";
  return "Indisponível";
}

/** "lon,lat;lon,lat;..." polygon string (API format) for an H3 cell. */
export function cellPolygonParam(boundary: [number, number][]): string {
  return boundary.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";");
}
