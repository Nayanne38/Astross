// Tiny bus between the sidebar search and the map (the map may not be mounted yet: the last
// request is kept and consumed when it mounts). Positions are never sent or stored anywhere.
export interface FlyTo { lat: number; lon: number; label: string }
let pending: FlyTo | null = null;
const listeners = new Set<(t: FlyTo) => void>();

export function requestFlyTo(t: FlyTo) {
  pending = t;
  listeners.forEach((l) => l(t));
}
export function consumeFlyTo(): FlyTo | null {
  const t = pending;
  pending = null;
  return t;
}
export function onFlyTo(cb: (t: FlyTo) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Parses "lat, lon" (decimal degrees, comma/semicolon/space separated). */
export function parseLatLon(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  // allow decimal commas only when the separator is ";" or space ("-10,2; -48,3")
  const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
