"use client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setApiLang } from "@/lib/api";
import { DEFAULT_FILTERS, periodRange, type Filters } from "@/lib/filters";
import { COUNTRY_COOKIE } from "@/lib/emergency-numbers";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { BUNDLES, type Bundle } from "@/content";
import type { Meta } from "@/lib/types";

interface Prefs { scale: number; hc: boolean; colorblind: boolean; reduceMotion: boolean }
const DEFAULT_PREFS: Prefs = { scale: 1, hc: false, colorblind: false, reduceMotion: false };

interface Ctx {
  lang: Lang; setLang: (l: Lang) => void; t: Bundle;
  country: string | null; setCountry: (c: string) => void;
  filters: Filters; setFilters: (p: Partial<Filters>) => void; resetFilters: () => void;
  meta: Meta | undefined; range: [string, string] | null;
  /** True when the selected region is NRT-only (no history, no calendar/harmonization/forecast). */
  live: boolean;
  /** the region has a loaded historical series (calendar, harmonization, CSV) */
  series: boolean;
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  offline: boolean; markOffline: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProviders");
  return c;
}

export function AppProviders({ initialLang, initialCountry, children }: { initialLang: Lang; initialCountry: string | null; children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={qc}>
      <Inner initialLang={initialLang} initialCountry={initialCountry}>{children}</Inner>
    </QueryClientProvider>
  );
}

function Inner({ initialLang, initialCountry, children }: { initialLang: Lang; initialCountry: string | null; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [country, setCountryState] = useState<string | null>(initialCountry);
  const [rawFilters, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [prefs, setP] = useState<Prefs>(DEFAULT_PREFS);
  const [offline, setOffline] = useState(false);

  setApiLang(lang);

  const metaQ = useQuery({
    queryKey: ["meta", lang],
    queryFn: async () => {
      const r = await getJSON<Meta>("/meta");
      if (r.offline) setOffline(true);
      return r.data;
    },
  });
  const meta = metaQ.data;

  // restore prefs once (storage only exists in the browser; done from a timer callback, not the effect body)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem("firetrack.prefs");
        if (raw) setP({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      } catch { /* blocked storage */ }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--font-scale", String(prefs.scale));
    r.classList.toggle("hc", prefs.hc);
    r.classList.toggle("reduce-motion", prefs.reduceMotion);
    r.lang = lang === "pt" ? "pt-BR" : "en";
  }, [prefs, lang]);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setP((cur) => {
      const n = { ...cur, ...p };
      try { localStorage.setItem("firetrack.prefs", JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    setLangState(l);
  }, []);

  const setCountry = useCallback((cc: string) => {
    document.cookie = `${COUNTRY_COOKIE}=${cc}; path=/; max-age=31536000; samesite=lax`;
    setCountryState(cc);
  }, []);

  const setFilters = useCallback((p: Partial<Filters>) => setF((c) => ({ ...c, ...p })), []);
  const resetFilters = useCallback(() => setF((c) => ({ ...DEFAULT_FILTERS, region: c.region })), []);

  // an unknown region (before /meta loads or after it changes) falls back to the API default
  const validRegion = !meta || !rawFilters.region || meta.regions.some((r) => r.key === rawFilters.region);
  const filters = useMemo(() => (validRegion ? rawFilters : { ...rawFilters, region: "" }), [validRegion, rawFilters, meta]);
  const reg = meta?.regions.find((r) => r.key === filters.region);
  const range = useMemo<[string, string] | null>(() => {
    if (!reg?.data_start || !reg.data_end) return null;
    return periodRange(filters.period, reg.data_start, reg.data_end, { from: filters.from, to: filters.to });
  }, [reg, filters.period, filters.from, filters.to]);

  const value: Ctx = {
    lang, setLang, country, setCountry, t: BUNDLES[lang], filters, setFilters, resetFilters, meta, range, live: !!reg?.live, series: !!reg?.data_start, prefs, setPrefs,
    offline, markOffline: () => setOffline(true),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
