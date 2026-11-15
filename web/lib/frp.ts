import type { Detection } from "./types";

/** FRP quartile class per sensor (relative to each sensor, as the filter note says). */
export function frpClasses(dets: Detection[]) {
  const q = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return [0.25, 0.5, 0.75].map((p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0); };
  const by = { MODIS: q(dets.filter((d) => d.sensor_family === "MODIS" && d.frp != null).map((d) => d.frp!)), VIIRS: q(dets.filter((d) => d.sensor_family === "VIIRS" && d.frp != null).map((d) => d.frp!)) };
  const names = ["baixa", "media", "alta", "muito_alta"] as const;
  return {
    cut: by,
    of: (d: Detection): (typeof names)[number] => {
      const c = by[d.sensor_family as "MODIS" | "VIIRS"] ?? by.VIIRS;
      const v = d.frp ?? 0;
      return names[v <= c[0] ? 0 : v <= c[1] ? 1 : v <= c[2] ? 2 : 3];
    },
  };
}
