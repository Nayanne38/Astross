// File-data mode (NEXT_PUBLIC_STATIC_DATA=1, optional): there is no API server, so every API call is answered from a pre-generated JSON
// file in /data (built by scripts/build_static_data.py and refreshed by the Pages workflow). Free-form filters
// (dates, drawn areas, limits) are dropped: only region / time window / audience select a file.
export const STATIC = process.env.NEXT_PUBLIC_STATIC_DATA === "1";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type P = Record<string, string | number | boolean | undefined | null>;

const KEYS: Record<string, string[]> = {
  "/meta": [], "/glossary": [], "/world": ["days"], "/live": ["region", "days"], "/summary": ["region"],
  "/hexgrid": ["region"], "/recent": ["region"], "/forecast": ["region"], "/forecast/live": ["region"],
  "/calendar": ["region"], "/harmonization": ["region"], "/comparison": ["region"],
  "/forecast/insight": ["region", "audience"],
};

/** Must match staticName() in scripts/build_static_data.py. */
export function staticName(path: string, params: P = {}): string | null {
  const keys = KEYS[path];
  if (!keys) return null;
  const parts = [path.replace(/^\//, "").replace(/\//g, "_")];
  for (const k of keys) {
    const v = params[k];
    if (v === undefined || v === null || v === "") {
      if (k === "region") return null;
      continue;
    }
    parts.push(String(v));
  }
  return parts.join(".") + ".json";
}

export function staticUrl(path: string, params: P = {}): string | null {
  const n = staticName(path, params);
  return n ? `${BP}/data/${n}` : null;
}

export function staticCsv(params: P): string {
  const kind = params.kind === "forecast" || params.kind === "calendar" ? params.kind : "monthly";
  return `${BP}/data/export.${params.region ?? "matopiba"}.${kind}.csv`;
}
