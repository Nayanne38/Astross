// Sequential palettes for the hex map and calendar. Each is sampled into N classes.
export type PaletteId = "inferno" | "cividis" | "contraste" | "cinza";
export const PALETTE_IDS: PaletteId[] = ["inferno", "cividis", "contraste", "cinza"];

const STOPS: Record<PaletteId, string[]> = {
  inferno: ["#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
  contraste: ["#0000ff", "#00a0ff", "#00ffa0", "#ffff00", "#ff8000", "#ff0000"],
  cinza: ["#202020", "#4a4a4a", "#747474", "#9e9e9e", "#c8c8c8", "#f2f2f2"],
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

/** Interpolate t in [0,1] along the palette stops. */
export function sample(id: PaletteId, t: number): string {
  const s = STOPS[id];
  const x = Math.min(1, Math.max(0, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(s[i]);
  const b = hexToRgb(s[i + 1]);
  return rgbToHex(a.map((v, k) => v + (b[k] - v) * f));
}

/** N class colors. Dark end is skipped a bit so the lowest class is visible on the dark basemap. */
export function classColors(id: PaletteId, n: number, invert = false): string[] {
  const lo = id === "inferno" || id === "cividis" ? 0.15 : 0;
  const out = Array.from({ length: n }, (_, i) => sample(id, lo + ((1 - lo) * i) / Math.max(1, n - 1)));
  return invert ? out.reverse() : out;
}

/** Quantile breaks (n-1 upper bounds) over positive values. */
export function quantileBreaks(values: number[], n: number): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(v[Math.min(v.length - 1, Math.floor((i / n) * v.length))]);
  return out;
}

export function classOf(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return i;
}
