// Color scales. Sequential palettes are perceptually uniform (Inferno, Cividis) or designed for low
// vision (high contrast) and print (grayscale). Anomalies use a blue↔orange diverging scale (never red↔green).

export type PaletteId = "inferno" | "cividis" | "contraste" | "cinza";

export const PALETTES: Record<PaletteId, { label: string; stops: string[] }> = {
  // matplotlib inferno without the near-black start (invisible on the dark background)
  inferno: { label: "Inferno", stops: ["#2c0b4f", "#56106e", "#7f1d6e", "#a62e5f", "#cb4149", "#e85d2f", "#f8850f", "#fbb61a", "#f6e05d", "#fcffa4"] },
  cividis: { label: "Cividis", stops: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"] },
  contraste: { label: "Alto contraste", stops: ["#1e90ff", "#00e5ff", "#ffffff", "#ffe14d", "#ff7a2f", "#ff2e63"] },
  cinza: { label: "Escala de cinza", stops: ["#2a2f33", "#ffffff"] },
};

export const DIVERGING = ["#2f6db3", "#6b9fd6", "#a9c6e8", "#3a4249", "#f6c49a", "#f08a3c", "#c4520f"];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** k evenly spaced colors interpolated along the palette stops. */
export function classColors(id: PaletteId, k: number, invert = false): string[] {
  const stops = PALETTES[id].stops.map(hexToRgb);
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    const t = k === 1 ? 1 : i / (k - 1);
    const x = t * (stops.length - 1);
    const j = Math.min(Math.floor(x), stops.length - 2);
    const f = x - j;
    out.push(rgbToHex(stops[j].map((a, c) => a + (stops[j + 1][c] - a) * f)));
  }
  return invert ? out.reverse() : out;
}

/** Quantile class breaks (k-1 upper bounds) over positive values. */
export function quantileBreaks(values: number[], k: number): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const br: number[] = [];
  for (let i = 1; i < k; i++) br.push(v[Math.min(v.length - 1, Math.floor((i / k) * v.length))]);
  return br;
}

export function classOf(x: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && x > breaks[i]) i++;
  return i;
}

/** Diverging class for a % deviation. */
export function divergingColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "#1c262d";
  const edges = [-50, -25, -10, 10, 25, 50];
  return DIVERGING[classOf(pct, edges)];
}
