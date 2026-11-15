// Fetch layer. Every successful GET is cached in localStorage so the app keeps working offline
// (the status bar shows "modo offline" when a response came from that cache).
import type { Lang } from "./i18n";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";
export type Params = Record<string, string | number | boolean | undefined | null>;

let apiLang: Lang = "pt";
export function setApiLang(l: Lang) { apiLang = l; }
export function getApiLang(): Lang { return apiLang; }

export function apiUrl(path: string, params: Params = {}): string {
  const u = new URL(path, API_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  return u.toString();
}

/** Stable key: path + sorted params (order of object keys must not matter). */
export function cacheKey(path: string, params: Params = {}): string {
  const q = Object.keys(params).sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${k}=${String(params[k])}`).join("&");
  return `ft:${path}?${q}`;
}

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export interface Fetched<T> { data: T; offline: boolean }

export async function getJSON<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<Fetched<T>> {
  const p = { lang: apiLang, ...params };
  const key = cacheKey(path, p);
  try {
    const r = await fetch(apiUrl(path, p), { signal });
    if (!r.ok) {
      let detail = r.statusText;
      try { detail = (await r.json()).detail ?? detail; } catch { /* not json */ }
      throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), r.status);
    }
    const data = (await r.json()) as T;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota / private mode */ }
    return { data, offline: false };
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof ApiError && e.status < 500) throw e;
    try {
      const hit = localStorage.getItem(key);
      if (hit) return { data: JSON.parse(hit) as T, offline: true };
    } catch { /* storage blocked */ }
    throw e;
  }
}

export function csvUrl(params: Params): string {
  return apiUrl("/export.csv", { lang: apiLang, ...params });
}
