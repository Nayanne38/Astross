"use client";

// Global state: filters live in the URL query string (shareable links) and in this context.
// Controls update instantly (draft); the URL and data queries follow after a 300 ms debounce.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { getJSON, type Source } from "@/lib/api";
import {
  DEFAULT_FILTERS, areaParams, filterRange, parseFilters, serializeFilters, type Filters, type Layer,
} from "@/lib/filters";
import { FONT_STEPS, getPrefs, getServerPrefs, setPrefs, subscribePrefs, type Prefs } from "@/lib/prefs";
import type { PaletteId } from "@/lib/palettes";
import type { Meta, Region } from "@/lib/types";

export type MapMode = Layer;
const DEBOUNCE_MS = 300;

interface State {
  meta: Meta | null;
  metaError: string | null;
  retryMeta: () => void;
  region: Region | null;
  /** Filters as shown in the controls (instant). */
  filters: Filters;
  /** Filters after the debounce: what the URL and the data queries use. */
  committed: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  /** Link to another view keeping the current filters (optionally changed). */
  hrefWith: (path: string, patch?: Partial<Filters>) => string;
  range: { start?: string; end?: string };
  area: { bbox?: string; polygon?: string };
  palette: PaletteId; // effective palette (high contrast forces "contraste")
  invert: boolean;
  classes: number;
  mapMode: MapMode;
  setMapMode: (m: MapMode) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  sources: Record<string, Source>;
  reportSource: (key: string, s: Source) => void;
}

const Ctx = createContext<State | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false } },
  }));
  return <QueryClientProvider client={client}><AppStateProvider>{children}</AppStateProvider></QueryClientProvider>;
}

function AppStateProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const sp = useSearchParams();
  const urlQs = sp.toString();
  const committed = useMemo(() => parseFilters(new URLSearchParams(urlQs)), [urlQs]);

  // Draft filters belong to the URL state they were edited from; once the URL catches up they are dropped.
  const [draft, setDraft] = useState<{ base: string; value: Filters } | null>(null);
  const filters = draft && draft.base === urlQs ? draft.value : committed;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(filters);
  useEffect(() => { latest.current = filters; }, [filters]);

  const writeUrl = useCallback((f: Filters) => {
    const q = serializeFilters(f);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft({ base: urlQs, value: next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeUrl(next), DEBOUNCE_MS);
  }, [urlQs, writeUrl]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const resetFilters = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const next = { ...DEFAULT_FILTERS, region: latest.current.region };
    latest.current = next;
    setDraft({ base: urlQs, value: next });
    writeUrl(next);
  }, [urlQs, writeUrl]);

  const hrefWith = useCallback((path: string, patch?: Partial<Filters>) => {
    const q = serializeFilters({ ...latest.current, ...patch });
    return q ? `${path}?${q}` : path;
  }, []);

  const metaQ = useQuery({
    queryKey: ["/meta"],
    queryFn: ({ signal }) => getJSON<Meta>("/meta", {}, signal),
    staleTime: 60_000,
  });
  const meta = metaQ.data?.data ?? null;

  const region = useMemo(() => {
    if (!meta) return null;
    const k = committed.region || meta.default_region;
    return meta.regions.find((r) => r.key === k) || meta.regions[0] || null;
  }, [meta, committed.region]);

  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  useEffect(() => {
    const el = document.documentElement;
    el.style.fontSize = `${FONT_STEPS[prefs.fontStep] * 100}%`;
    el.classList.toggle("hc", prefs.highContrast);
    el.classList.toggle("reduce-motion", prefs.reduceMotion);
  }, [prefs]);

  const [sources, setSources] = useState<Record<string, Source>>({});
  const reportSource = useCallback((key: string, s: Source) => setSources((x) => (x[key] === s ? x : { ...x, [key]: s })), []);

  const range = useMemo(() => filterRange(committed, region?.data_end), [committed, region]);
  const area = useMemo(() => areaParams(committed.area), [committed.area]);
  const setMapMode = useCallback((m: MapMode) => setFilters({ layer: m }), [setFilters]);

  const value: State = {
    meta, metaError: metaQ.error ? String(metaQ.error) : null, retryMeta: () => { void metaQ.refetch(); },
    region, filters, committed, setFilters, resetFilters, hrefWith, range, area,
    palette: prefs.highContrast ? "contraste" : filters.palette, invert: filters.invert, classes: filters.classes,
    mapMode: filters.layer, setMapMode, prefs, setPrefs,
    sources: metaQ.data ? { ...sources, meta: metaQ.data.source } : sources, reportSource,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside AppStateProvider");
  return v;
}

type Params = Record<string, string | number | boolean | undefined>;

/**
 * Fetch an API resource (TanStack Query: cached, deduplicated, stale requests aborted).
 * Keeps the previous data visible while a new request for changed params runs.
 */
export function useApi<T>(path: string | null, params: Params) {
  const { reportSource } = useAppState();
  const q = useQuery({
    queryKey: [path, params],
    enabled: !!path,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const r = await getJSON<T>(path!, params, signal);
      reportSource(path!, r.source);
      return r.data;
    },
  });
  return {
    data: (q.data ?? null) as T | null,
    error: q.error && !q.isFetching ? String(q.error) : null,
    loading: !!path && (q.isPending || q.isPlaceholderData),
    refetch: () => { void q.refetch(); },
  };
}
