// Per-viewer accessibility preferences, persisted in localStorage (wrapped in try/catch: storage can be
// blocked). Exposed as an external store so React reads it without effects or hydration mismatches.

export interface Prefs { fontStep: number; highContrast: boolean; reduceMotion: boolean }
export const FONT_STEPS = [1, 1.125, 1.25, 1.4]; // A− / A+ (4 steps)
const KEY = "firetrack.prefs.v1";
const DEFAULT: Prefs = { fontStep: 0, highContrast: false, reduceMotion: false };

let current: Prefs = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      fontStep: Number.isInteger(p.fontStep) && p.fontStep! >= 0 && p.fontStep! < FONT_STEPS.length ? p.fontStep! : 0,
      highContrast: !!p.highContrast,
      reduceMotion: !!p.reduceMotion,
    };
  } catch {
    return DEFAULT;
  }
}

export function subscribePrefs(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getPrefs(): Prefs {
  if (!loaded && typeof window !== "undefined") { current = load(); loaded = true; }
  return current;
}
export function getServerPrefs(): Prefs {
  return DEFAULT;
}
export function setPrefs(patch: Partial<Prefs>) {
  current = { ...getPrefs(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach((l) => l());
}
