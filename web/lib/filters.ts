// Filter state <-> URL query string. Every view is a shareable link: only non-default values are written.
import { addDays } from "./format";
import type { PaletteId } from "./palettes";

export type PeriodId = "serie" | "5a" | "12m" | "30d" | "1d" | "custom";
export type Layer = "densidade" | "focos" | "risco";
export type Sensor = "todos" | "modis" | "viirs";
export type CategoryFilter = "todas" | "modis" | "viirs" | "coincidentes";
export type FrpClass = "baixa" | "media" | "alta" | "muito_alta";

export interface Filters {
  region: string | null;
  period: PeriodId;
  start: string | null; // only used when period = "custom"
  end: string | null;
  palette: PaletteId;
  invert: boolean;
  classes: number; // 4..9
  layer: Layer;
  sensor: Sensor;
  category: CategoryFilter;
  frp: FrpClass[]; // empty = all
  area: string | null; // "bbox:w,s,e,n" or "poly:lon,lat;lon,lat;..."
  cell: string | null;
}

export const DEFAULT_FILTERS: Filters = {
  region: null, period: "serie", start: null, end: null, palette: "inferno", invert: false, classes: 5,
  layer: "densidade", sensor: "todos", category: "todas", frp: [], area: null, cell: null,
};

export const PERIOD_IDS: PeriodId[] = ["serie", "5a", "12m", "30d", "1d", "custom"];
const PALETTE_IDS: PaletteId[] = ["inferno", "cividis", "contraste", "cinza"];
const LAYERS: Layer[] = ["densidade", "focos", "risco"];
const SENSORS: Sensor[] = ["todos", "modis", "viirs"];
const CATEGORIES: CategoryFilter[] = ["todas", "modis", "viirs", "coincidentes"];
export const FRP_CLASSES: FrpClass[] = ["baixa", "media", "alta", "muito_alta"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Validates an area string; returns it normalized or null. */
export function parseArea(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/\s/g, "");
  if (s.startsWith("bbox:")) {
    const n = s.slice(5).split(",").map(Number);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
    const [w, so, e, no] = n;
    if (w >= e || so >= no || Math.abs(so) > 90 || Math.abs(no) > 90 || Math.abs(w) > 180 || Math.abs(e) > 180) return null;
    return `bbox:${n.join(",")}`;
  }
  if (s.startsWith("poly:")) {
    const pts = s.slice(5).split(";").map((p) => p.split(",").map(Number));
    if (pts.length < 3 || pts.some((p) => p.length !== 2 || p.some((x) => !Number.isFinite(x)))) return null;
    return `poly:${pts.map((p) => p.join(",")).join(";")}`;
  }
  return null;
}

export function parseFilters(sp: URLSearchParams): Filters {
  const d = DEFAULT_FILTERS;
  const classes = Number(sp.get("classes"));
  const period = oneOf(sp.get("period"), PERIOD_IDS, d.period);
  const start = sp.get("start"), end = sp.get("end");
  const okDates = period === "custom" && !!start && !!end && ISO.test(start) && ISO.test(end) && start <= end;
  return {
    region: sp.get("region") || null,
    period: period === "custom" && !okDates ? d.period : period,
    start: okDates ? start : null,
    end: okDates ? end : null,
    palette: oneOf(sp.get("palette"), PALETTE_IDS, d.palette),
    invert: sp.get("invert") === "1",
    classes: Number.isInteger(classes) && classes >= 4 && classes <= 9 ? classes : d.classes,
    layer: oneOf(sp.get("layer"), LAYERS, d.layer),
    sensor: oneOf(sp.get("sensor"), SENSORS, d.sensor),
    category: oneOf(sp.get("category"), CATEGORIES, d.category),
    frp: (sp.get("frp") || "").split(",").filter((x): x is FrpClass => (FRP_CLASSES as string[]).includes(x))
      .filter((x, i, a) => a.indexOf(x) === i),
    area: parseArea(sp.get("area")),
    cell: sp.get("cell") || null,
  };
}

export function serializeFilters(f: Filters): string {
  const d = DEFAULT_FILTERS;
  const u = new URLSearchParams();
  if (f.region) u.set("region", f.region);
  if (f.period !== d.period) u.set("period", f.period);
  if (f.period === "custom" && f.start && f.end) { u.set("start", f.start); u.set("end", f.end); }
  if (f.palette !== d.palette) u.set("palette", f.palette);
  if (f.invert) u.set("invert", "1");
  if (f.classes !== d.classes) u.set("classes", String(f.classes));
  if (f.layer !== d.layer) u.set("layer", f.layer);
  if (f.sensor !== d.sensor) u.set("sensor", f.sensor);
  if (f.category !== d.category) u.set("category", f.category);
  const frp = FRP_CLASSES.filter((c) => f.frp.includes(c));
  if (frp.length && frp.length < FRP_CLASSES.length) u.set("frp", frp.join(","));
  if (f.area) u.set("area", f.area);
  if (f.cell) u.set("cell", f.cell);
  return u.toString();
}

/** Start/end dates for the API. "serie" sends nothing (the API uses the full record). */
export function filterRange(f: Pick<Filters, "period" | "start" | "end">, dataEnd?: string | null): { start?: string; end?: string } {
  if (f.period === "custom") return f.start && f.end ? { start: f.start, end: f.end } : {};
  if (!dataEnd || f.period === "serie") return {};
  const days = { "5a": 5 * 365, "12m": 365, "30d": 30, "1d": 1 }[f.period];
  return { start: addDays(dataEnd, -(days - 1)), end: dataEnd };
}

/** API area params (bbox or polygon) from the area filter. */
export function areaParams(area: string | null): { bbox?: string; polygon?: string } {
  if (!area) return {};
  if (area.startsWith("bbox:")) return { bbox: area.slice(5) };
  if (area.startsWith("poly:")) return { polygon: area.slice(5) };
  return {};
}

/** The API serves daily per-cell data from daily_window_start on; older periods are monthly. */
export function granularity(start: string | undefined, dailyWindowStart?: string | null): "Diário" | "Mensal" {
  return !!start && !!dailyWindowStart && start >= dailyWindowStart ? "Diário" : "Mensal";
}
