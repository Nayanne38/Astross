"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getJSON, type Source } from "@/lib/api";
import { addDays } from "@/lib/format";
import type { PaletteId } from "@/lib/palettes";
import type { Meta, Region } from "@/lib/types";

export type PeriodId = "serie" | "5a" | "12m" | "60d" | "30d" | "7d" | "1d";
export type MapMode = "densidade" | "focos" | "risco";
export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "serie", label: "Série completa (2003–hoje)" },
  { id: "5a", label: "Últimos 5 anos" },
  { id: "12m", label: "Últimos 12 meses" },
  { id: "60d", label: "Últimos 60 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "1d", label: "Últimas 24 h (último dia com dados)" },
];
// Default period per screen: the map opens on the last 30 days, the calendar on the full series.
const DEFAULT_PERIOD: Record<string, PeriodId> = { "/": "30d", "/previsao": "30d" };

interface State {
  meta: Meta | null;
  metaError: string | null;
  region: Region | null;
  setRegionKey: (k: string) => void;
  period: PeriodId;
  setPeriod: (p: PeriodId) => void;
  setPeriodFor: (path: string, p: PeriodId) => void;
  mapMode: MapMode;
  setMapMode: (m: MapMode) => void;
  range: { start?: string; end?: string };
  palette: PaletteId;
  setPalette: (p: PaletteId) => void;
  invert: boolean;
  setInvert: (b: boolean) => void;
  classes: number;
  setClasses: (n: number) => void;
  highContrast: boolean;
  setHighContrast: (b: boolean) => void;
  fontScale: number;
  setFontScale: (n: number) => void;
  sources: Record<string, Source>;
  reportSource: (key: string, s: Source) => void;
}

const Ctx = createContext<State | null>(null);

export function periodRange(p: PeriodId, dataEnd?: string | null): { start?: string; end?: string } {
  if (!dataEnd || p === "serie") return {};
  const days = { "5a": 5 * 365, "12m": 365, "60d": 60, "30d": 30, "7d": 7, "1d": 1 }[p];
  return { start: addDays(dataEnd, -(days - 1)), end: dataEnd };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Record<string, PeriodId>>({});
  const [palette, setPalette] = useState<PaletteId>("inferno");
  const [invert, setInvert] = useState(false);
  const [classes, setClasses] = useState(6);
  const [highContrast, setHighContrast] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [mapMode, setMapMode] = useState<MapMode>("densidade");

  useEffect(() => {
    getJSON<Meta>("/meta")
      .then(({ data, source }) => { setMeta(data); setSources((s) => ({ ...s, meta: source })); })
      .catch((e) => setMetaError(String(e)));
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);
  useEffect(() => {
    document.documentElement.classList.toggle("hc", highContrast);
  }, [highContrast]);

  const region = useMemo(() => {
    if (!meta) return null;
    const k = regionKey || meta.default_region;
    return meta.regions.find((r) => r.key === k) || meta.regions[0] || null;
  }, [meta, regionKey]);

  const period = periods[pathname] || DEFAULT_PERIOD[pathname] || "serie";
  const setPeriodFor = useCallback((path: string, p: PeriodId) => setPeriods((s) => ({ ...s, [path]: p })), []);
  const setPeriod = useCallback((p: PeriodId) => setPeriodFor(pathname, p), [pathname, setPeriodFor]);
  const range = useMemo(() => periodRange(period, region?.data_end), [period, region]);
  const reportSource = useCallback((key: string, s: Source) => setSources((x) => (x[key] === s ? x : { ...x, [key]: s })), []);

  const value: State = {
    meta, metaError, region, setRegionKey, period, setPeriod, setPeriodFor, mapMode, setMapMode, range,
    palette: highContrast ? "contraste" : palette, setPalette, invert, setInvert, classes, setClasses,
    highContrast, setHighContrast, fontScale, setFontScale, sources, reportSource,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside AppStateProvider");
  return v;
}

/** Fetch an API resource bound to the current region; re-runs when deps change. */
export function useApi<T>(path: string | null, params: Record<string, string | number | boolean | undefined>) {
  const { reportSource } = useAppState();
  // Result is stored with the request key it belongs to; "loading" is derived (no setState in the effect body).
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const key = path ? path + JSON.stringify(params) : null;
  useEffect(() => {
    if (!path || !key) return;
    let alive = true;
    getJSON<T>(path, params)
      .then(({ data, source }) => {
        if (!alive) return;
        setResult({ key, data, error: null });
        reportSource(path, source);
      })
      .catch((e) => { if (alive) setResult((r) => ({ key, data: r?.data ?? null, error: String(e) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const fresh = result?.key === key;
  return {
    data: result?.data ?? null,             // keeps the previous data visible while the new request runs
    error: fresh ? result!.error : null,
    loading: key !== null && !fresh,
  };
}
