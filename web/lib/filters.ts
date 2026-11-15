// Filter state shared by every page (sidebar). Pure helpers live here so they can be unit-tested.
import { addDays } from "./format";
import type { PaletteId } from "./palettes";

export type PeriodId = "serie" | "5a" | "12m" | "30d" | "1d" | "custom";
export type Sensor = "todos" | "modis" | "viirs";
export type Category = "todas" | "modis" | "viirs" | "coincidentes";
export type FrpClass = "baixa" | "media" | "alta" | "muito_alta";
export type Layer = "densidade" | "focos" | "risco";

export interface Filters {
  region: string;
  period: PeriodId;
  from: string;
  to: string;
  sensor: Sensor;
  category: Category;
  frp: FrpClass[];
  palette: PaletteId;
  invert: boolean;
  classes: number;
  layer: Layer;
  bbox: [number, number, number, number] | null;
  /** Live (NRT-only) regions: how many days back, 1-5. */
  liveDays: number;
}

export const DEFAULT_FILTERS: Filters = {
  region: "", period: "serie", from: "", to: "", sensor: "todos", category: "todas",
  frp: [], palette: "inferno", invert: false, classes: 7, layer: "densidade", bbox: null, liveDays: 1,
};

export const PERIODS: PeriodId[] = ["serie", "5a", "12m", "30d", "1d", "custom"];

/** Resolve a period to [start, end] given the data range. Dates are ISO yyyy-mm-dd. */
export function periodRange(p: PeriodId, dataStart: string, dataEnd: string, custom?: { from: string; to: string }): [string, string] {
  const clamp = (d: string) => (d < dataStart ? dataStart : d > dataEnd ? dataEnd : d);
  switch (p) {
    case "serie": return [dataStart, dataEnd];
    case "5a": return [clamp(`${Number(dataEnd.slice(0, 4)) - 5}${dataEnd.slice(4)}`), dataEnd];
    case "12m": return [clamp(addDays(dataEnd, -364)), dataEnd];
    case "30d": return [clamp(addDays(dataEnd, -29)), dataEnd];
    case "1d": return [dataEnd, dataEnd];
    case "custom": {
      const f = custom?.from || addDays(dataEnd, -29);
      const t = custom?.to || dataEnd;
      return [clamp(f), clamp(t)];
    }
  }
}

/** Daily data only exists inside the daily window; earlier periods use monthly totals. */
export function granularity(start: string, dailyStart: string | null): "Diário" | "Mensal" {
  return dailyStart && start >= dailyStart ? "Diário" : "Mensal";
}

export function validRange(from: string, to: string): boolean {
  return !!from && !!to && from <= to;
}

/** Value of a hex cell under the sensor/category filters (null = cell hidden). */
export function cellValue(
  c: { value: number; modis_count: number; viirs_count: number },
  sensor: Sensor, category: Category,
): number | null {
  const m = c.modis_count > 0, v = c.viirs_count > 0;
  if (category === "modis" && !(m && !v)) return null;
  if (category === "viirs" && !(v && !m)) return null;
  if (category === "coincidentes" && !(m && v)) return null;
  if (sensor === "modis") return m ? c.modis_count : null;
  if (sensor === "viirs") return v ? c.viirs_count : null;
  return c.value > 0 ? c.value : null;
}
