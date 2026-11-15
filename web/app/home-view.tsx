"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { cellToBoundary, cellToParent } from "h3-js";
import { Crosshair, Download, Expand, Layers, LocateFixed, PenLine, RotateCcw, Shrink, X } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import { EmptyState, ErrorBox, Loading, Pill, StatCard } from "@/components/panel";
import type { Basemap, DrawMode, MapHex, MapPoint } from "@/components/hex-map";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { copy } from "@/content/copy";
import { csvUrl } from "@/lib/api";
import { MESES, brDate, cap, int, num, signedPct } from "@/lib/format";
import { classColors, classOf, quantileBreaks } from "@/lib/palettes";
import { parseArea, type Layer } from "@/lib/filters";
import {
  AREA_KM2, FRP_ORDER, aggregateCells, anomalyBadge, cellPolygonParam, detectionCategories, displayRes, frpClass,
  frpQuartiles, frpRadius, matchesCategory, type AggCell,
} from "@/lib/map-layers";
import { cn } from "@/lib/utils";
import type { ForecastResponse, HexGridResponse, RecentResponse, Summary } from "@/lib/types";

const M = copy.map;
const K = copy.cards;
const HEX_CAP = 3000;
const POINT_CAP = 5000;
const POINT_DAYS = 60; // API limit for individual detections
const t = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const toolBtn = cn("grid size-9 place-items-center rounded-md border border-border bg-panel/95 text-foreground shadow hover:bg-accent pointer-coarse:size-11", ring);
const menuItem = cn("rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40 pointer-coarse:min-h-11", ring);

const HexMap = dynamic(() => import("@/components/hex-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">{copy.states.loading} mapa…</div>,
});

function badgeTone(b: string) {
  return b === "Acima" ? "bg-fire/20 text-fire" : b === "Abaixo" ? "bg-sky-400/15 text-sky-300" : "bg-brand/15 text-brand";
}
function dominant(c: { modis: number; viirs: number }) {
  return c.modis === c.viirs ? "empate" : c.modis > c.viirs ? "MODIS" : "VIIRS";
}

export function HomeView() {
  const s = useAppState();
  const { region, range, area, palette, classes, invert, committed: f, setFilters } = s;
  const [zoom, setZoom] = useState(5);
  const [basemap, setBasemap] = useState<Basemap>("escuro");
  const [tileFailed, setTileFailed] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [typedOpen, setTypedOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [asTable, setAsTable] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const res = displayRes(zoom);
  const layer = s.filters.layer;

  const start = range.start ?? region?.data_start ?? undefined;
  const end = range.end ?? region?.data_end ?? undefined;
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1 : 9999;
  const pointDays = Math.min(days, POINT_DAYS);
  const base = { region: region?.key, ...area };

  const sum = useApi<Summary>(region ? "/summary" : null, { ...base, start, end, learn: false });
  const hex = useApi<HexGridResponse>(region && layer === "densidade" ? "/hexgrid" : null,
    { ...base, start, end, boundary: false, limit: 100000, learn: false });
  const rec = useApi<RecentResponse>(region && layer === "focos" ? "/recent" : null,
    { ...base, days: pointDays, limit: 30000, learn: false });
  const riskOn = !!sum.data?.risk_next_7_days?.available;
  const fc = useApi<ForecastResponse>(region && layer === "risco" && riskOn ? "/forecast" : null,
    { ...base, limit: 60000, learn: false, boundary: false, fallback: false });

  // ------------------------------------------------ density layer (memoized: rebuilt only when its inputs change)
  const density = useMemo(() => {
    const all = aggregateCells(hex.data?.cells ?? [], res, f.sensor, f.category);
    const drawn = all.slice(0, HEX_CAP);
    const breaks = quantileBreaks(drawn.map((c) => c.value), classes);
    const colors = classColors(palette, classes, invert);
    const gran = hex.data?.granularity;
    const T = M.tooltip;
    const hexes: MapHex[] = drawn.map((c) => {
      const k = classOf(c.value, breaks);
      const cat = c.modis > 0 && c.viirs > 0 ? T.category.coincidentes : c.modis > 0 ? T.category.modis : T.category.viirs;
      return {
        id: c.id, color: colors[k], opacity: 0.55 + 0.4 * (k / Math.max(1, classes - 1)),
        tooltip: `<b>${num(c.value, gran === "day" || f.sensor !== "todos" ? 0 : 1)} ${M.densityUnit[f.sensor]}</b>`
          + `<br/>${t(T.percentile, { p: c.percentile })}<br/>${T.dominant}: ${dominant(c)} (MODIS ${int(c.modis)} · VIIRS ${int(c.viirs)})`
          + `<br/>${cat}${res < 6 ? `<br/>${t(T.sum, { n: c.n })}` : ""}`,
      };
    });
    return { all, drawn, hexes, breaks, colors };
  }, [hex.data, res, f.sensor, f.category, classes, palette, invert]);

  // ------------------------------------------------ points layer (client-side filters, no refetch)
  const pointsData = useMemo(() => {
    const det = rec.data?.detections ?? [];
    return { det, q: frpQuartiles(det), cats: detectionCategories(det) };
  }, [rec.data]);
  const points = useMemo(() => {
    const { det, q, cats } = pointsData;
    const colors = classColors(palette, 4, invert);
    const sel = det.map((d, i) => ({ d, cat: cats[i], cls: frpClass(d.frp, q[d.sensor_family as "MODIS" | "VIIRS"] ?? []) }))
      .filter(({ d, cat, cls }) =>
        (f.sensor === "todos" || d.sensor_family.toLowerCase() === f.sensor)
        && matchesCategory(cat, f.category)
        && (f.frp.length === 0 || (cls !== null && f.frp.includes(cls))))
      .sort((a, b) => (b.d.frp ?? 0) - (a.d.frp ?? 0));
    const T = M.tooltip;
    const pts: MapPoint[] = sel.slice(0, POINT_CAP).map(({ d, cat, cls }) => ({
      lat: d.lat, lon: d.lon, radius: frpRadius(d.frp), color: colors[cls ? FRP_ORDER.indexOf(cls) : 0],
      tooltip: `<b>${brDate(d.date)} · ${String(d.time_utc).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")} UTC</b>`
        + `<br/>${d.satellite} (${d.sensor_family})${d.daynight ? ` · ${d.daynight === "D" ? T.day : T.night}` : ""}`
        + `<br/>FRP ${d.frp == null ? "—" : num(d.frp, 1) + " MW"}${cls ? ` (${copy.sidebar.frpClasses[cls].toLowerCase()} p/ ${d.sensor_family})` : ""}`
        + `<br/>${T.confidence}: ${d.confidence_class} · ${T.category[cat]}<br/><i>${M.pointDisclaimer}</i>`,
    }));
    return { pts, total: sel.length, colors };
  }, [pointsData, f.sensor, f.category, f.frp, palette, invert]);

  // ------------------------------------------------ risk layer (only when a model forecast exists)
  const risk = useMemo(() => {
    const order = ["baixo", "moderado", "alto", "muito_alto"];
    const colors = classColors(palette, 4, invert);
    // aggregate to the display resolution keeping the highest probability (and its class) per parent cell
    const agg = new Map<string, { p: number; cls: string; n: number }>();
    if (layer === "risco") for (const c of fc.data?.cells ?? []) {
      const k = res === 6 ? c.cell_id : cellToParent(c.cell_id, res);
      const a = agg.get(k);
      if (!a) agg.set(k, { p: c.probability, cls: c.risk_class, n: 1 });
      else { a.n += 1; if (c.probability > a.p) { a.p = c.probability; a.cls = c.risk_class; } }
    }
    const all = [...agg.entries()].sort((x, y) => y[1].p - x[1].p);
    const hexes: MapHex[] = all.slice(0, HEX_CAP).map(([id, a]) => {
      const k = Math.max(0, order.indexOf(a.cls));
      return {
        id, color: colors[k], opacity: 0.55 + 0.4 * (k / 3),
        tooltip: `<b>${num(a.p * 100, 0)}%</b> · ${a.cls.replace("_", " ")}${res < 6 ? ` (${M.riskMax}, ${a.n} hexágonos de ~36 km²)` : ""}<br/><i>${M.riskTooltip}</i>`,
      };
    });
    return { hexes, colors, order, total: all.length };
  }, [fc.data, layer, palette, invert, res]);

  const onDrawn = useCallback((a: string) => { setDrawMode(null); setFilters({ area: a, cell: null }); }, [setFilters]);
  const onDrawCancel = useCallback(() => setDrawMode(null), []);
  const onMap = useCallback((m: L.Map) => { mapRef.current = m; }, []);
  const onCellClick = useCallback((id: string) => setFilters({ cell: id }), [setFilters]);

  function locate() {
    if (!("geolocation" in navigator)) { setGeoMsg(M.geo.unsupported); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoMsg("");
        import("leaflet").then((Lf) => {
          const m = mapRef.current;
          if (!m) return;
          Lf.circleMarker([p.coords.latitude, p.coords.longitude], { pane: "outline", radius: 7, color: "#ffffff", weight: 2, fillColor: "#3fd0b5", fillOpacity: 0.9 })
            .bindTooltip(M.geo.you).addTo(m);
          m.flyTo([p.coords.latitude, p.coords.longitude], Math.max(m.getZoom(), 9), { duration: 0.6 });
        });
      },
      () => setGeoMsg(M.geo.denied),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
      else if (wrapRef.current) { await wrapRef.current.requestFullscreen(); setFullscreen(true); }
    } catch { /* fullscreen refused by the browser */ }
  }

  if (!region) return s.metaError ? <ErrorBox error={s.metaError} onRetry={s.retryMeta} /> : <Loading what="regiões" />;

  const csv = csvUrl({ region: region.key, start, end, ...area });
  const active = layer === "densidade" ? hex : layer === "focos" ? rec : fc;
  const comp = sum.data?.comparison;
  const badge = anomalyBadge(comp?.category);
  const rs = sum.data?.risk_next_7_days;
  const cellSel = f.cell ? density.all.find((c) => c.id === f.cell) ?? null : null;
  const empty = !active.loading && !active.error && (
    layer === "densidade" ? density.drawn.length === 0 : layer === "focos" ? points.pts.length === 0 : risk.hexes.length === 0);

  return (
    <div className="space-y-4">
      {/* ---------------- cards */}
      <div className="grid gap-3 md:grid-cols-3">
        {sum.error ? <div className="md:col-span-3"><ErrorBox error={sum.error} onRetry={sum.refetch} /></div> : !sum.data ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-xl border border-border bg-panel" />)
        ) : (
          <>
            {f.area ? (
              <StatCard label={K.focosArea} value={int(Math.round(sum.data.total_harmonized))} note={`${brDate(start)} a ${brDate(end)} · ${K.focosAreaNote}`} />
            ) : (
              <StatCard label={K.focos} value={int(sum.data.total_hotspots)} note={`${brDate(start)} a ${brDate(end)} · ${K.focosNote}`} />
            )}
            <StatCard label={K.comparado} value={signedPct(comp?.deviation_pct)}
              badge={<span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badgeTone(badge))}>{badge}{comp?.percentile != null ? ` · percentil ${Math.round(comp.percentile)}` : ""}</span>}
              note={comp ? <>
                {comp.same_days_only ? t(K.sameDays, { d: comp.days_compared, n: comp.n_ref }) : t(K.fullMonth, { mes: cap(MESES[comp.month - 1]), n: comp.n_ref })}
                {comp.is_provisional ? " · dados provisórios" : ""}<br />{K.comparadoCuts}
              </> : undefined} />
            <StatCard label={K.risco} value={rs?.available ? `${int(rs.n_high + rs.n_very_high)} células` : K.riscoNA}
              badge={rs?.available ? <Pill>alto ou muito alto</Pill> : undefined}
              note={<>{rs?.message} {!rs?.available && <Link href={s.hrefWith("/previsao")} className="text-brand underline-offset-2 hover:underline">{M.toPrevisao}</Link>}</>} />
          </>
        )}
      </div>

      {/* ---------------- map */}
      <section className="rounded-xl border border-border bg-panel p-3 sm:p-4" aria-labelledby="map-title">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 id="map-title" className="text-base font-semibold">{M.panelTitle}</h2>
          <span className="text-xs text-muted-foreground">{region.name} · {brDate(start)} a {brDate(end)}{f.area ? ` · ${copy.sidebar.customArea}` : ""}</span>
          <button type="button" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}
            className={cn("ml-auto rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent pointer-coarse:min-h-11", ring)}>
            {asTable ? M.table.hide : M.table.show}
          </button>
        </div>

        {asTable ? (
          <CellTable rows={density.all.slice(0, 20)} unit={M.densityUnit[f.sensor]} loading={hex.loading} layer={layer} />
        ) : (
          <div ref={wrapRef} className="relative h-[50vh] min-h-[320px] overflow-hidden rounded-lg bg-background lg:h-[60vh]">
            <HexMap bbox={region.bbox} area={f.area} basemap={basemap} drawMode={drawMode} resetKey={resetKey}
              hexes={layer === "densidade" ? density.hexes : layer === "risco" ? risk.hexes : []}
              points={layer === "focos" ? points.pts : []}
              onZoom={setZoom} onMap={onMap} onCellClick={layer === "densidade" ? onCellClick : undefined}
              onDrawn={onDrawn} onDrawCancel={onDrawCancel} onTileError={setTileFailed} />

            {/* layer toggle (top-left) */}
            <div role="radiogroup" aria-label={M.layerLabel} className="absolute left-2 top-2 z-[500] flex gap-0.5 rounded-lg border border-border bg-panel/95 p-0.5 shadow">
              {(["densidade", "focos", "risco"] as Layer[]).map((l) => {
                const disabled = l === "risco" && !riskOn;
                return (
                  <button key={l} type="button" role="radio" aria-checked={layer === l} disabled={disabled}
                    title={disabled ? M.riskDisabled : undefined}
                    onClick={() => setFilters({ layer: l, cell: null })}
                    className={cn("rounded-md px-3 py-1 text-xs font-medium pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-40", ring,
                      layer === l ? "bg-brand text-black" : "text-muted-foreground hover:text-foreground")}>
                    {M.layers[l]}
                  </button>
                );
              })}
            </div>

            {/* tool column (right, under the zoom control) */}
            <div className="absolute right-2 top-[84px] z-[500] flex flex-col gap-1.5">
              <Popover>
                <PopoverTrigger aria-label={M.tools.camadas} title={M.tools.camadas} className={toolBtn}><Layers className="size-4" aria-hidden /></PopoverTrigger>
                <PopoverContent side="left" align="start" className="w-56 p-2">
                  <div role="radiogroup" aria-label={M.tools.camadas} className="flex flex-col gap-1">
                    {(["escuro", "claro", "satelite"] as Basemap[]).map((b) => (
                      <button key={b} type="button" role="radio" aria-checked={basemap === b} disabled={b === "satelite"}
                        onClick={() => { setTileFailed(false); setBasemap(b); }}
                        className={cn(menuItem, basemap === b && "bg-brand/15 text-brand")}>
                        {M.basemaps[b]}{b === "satelite" && <span className="block text-xs text-muted-foreground">{M.sateliteDisabled}</span>}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger aria-label={M.tools.desenhar} title={M.tools.desenhar} className={cn(toolBtn, drawMode && "border-brand text-brand")}><PenLine className="size-4" aria-hidden /></PopoverTrigger>
                <PopoverContent side="left" align="start" className="w-52 p-2">
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => setDrawMode("rect")} aria-pressed={drawMode === "rect"} className={menuItem}>{M.draw.rect}</button>
                    <button type="button" onClick={() => setDrawMode("poly")} aria-pressed={drawMode === "poly"} className={menuItem}>{M.draw.poly}</button>
                    <button type="button" onClick={() => setTypedOpen(true)} className={menuItem}>{M.draw.typed}</button>
                    <button type="button" disabled={!f.area && !drawMode} onClick={() => { setDrawMode(null); setFilters({ area: null }); }} className={menuItem}>{M.draw.clear}</button>
                  </div>
                </PopoverContent>
              </Popover>
              <button type="button" onClick={locate} aria-label={M.tools.localizacao} title={M.tools.localizacao} className={toolBtn}><LocateFixed className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => setResetKey((k) => k + 1)} aria-label={M.tools.reiniciar} title={M.tools.reiniciar} className={toolBtn}><RotateCcw className="size-4" aria-hidden /></button>
              <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? M.tools.sairTelaCheia : M.tools.telaCheia} title={fullscreen ? M.tools.sairTelaCheia : M.tools.telaCheia} className={toolBtn}>
                {fullscreen ? <Shrink className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
              </button>
              <a href={csv} aria-label={M.tools.csv} title={M.tools.csv} className={cn(toolBtn, "border-brand bg-brand text-black hover:bg-brand/90")}><Download className="size-4" aria-hidden /></a>
            </div>

            {/* banners (top-center) */}
            <div className="pointer-events-none absolute inset-x-0 top-12 z-[500] mx-auto flex w-fit max-w-[70%] flex-col items-center gap-1 text-center text-xs" aria-live="polite">
              {drawMode && <p className="rounded-md bg-panel/95 px-2 py-1 shadow"><Crosshair className="mr-1 inline size-3.5" aria-hidden />{drawMode === "rect" ? M.draw.hintRect : M.draw.hintPoly}</p>}
              {tileFailed && <p className="rounded-md bg-fire/90 px-2 py-1 text-black">{M.tileError}</p>}
              {geoMsg && <p className="rounded-md bg-panel/95 px-2 py-1 shadow">{geoMsg}</p>}
              {layer === "densidade" && density.all.length > HEX_CAP && <p className="rounded-md bg-panel/95 px-2 py-1 shadow">{t(M.capBanner, { n: int(HEX_CAP), total: int(density.all.length) })}</p>}
              {layer === "risco" && risk.total > HEX_CAP && <p className="rounded-md bg-panel/95 px-2 py-1 shadow">{t(M.capBanner, { n: int(HEX_CAP), total: int(risk.total) })}</p>}
              {layer === "focos" && points.total > POINT_CAP && <p className="rounded-md bg-panel/95 px-2 py-1 shadow">{t(M.pointsCapBanner, { n: int(POINT_CAP), total: int(points.total) })}</p>}
            </div>

            {/* states over the map */}
            {active.loading && <div className="pointer-events-none absolute inset-0 z-[450] grid place-items-center bg-background/30"><span role="status" className="animate-pulse rounded-md bg-panel px-3 py-1.5 text-sm">{copy.states.loading}…</span></div>}
            {active.error && <div className="absolute inset-x-4 bottom-20 z-[600]"><ErrorBox error={active.error} onRetry={active.refetch} /></div>}
            {empty && <div className="pointer-events-none absolute inset-x-8 top-1/3 z-[450]"><EmptyState /></div>}

            {/* legend (bottom-left) */}
            <div className="absolute bottom-2 left-2 z-[500] max-w-[min(380px,75%)] rounded-lg border border-border bg-panel/95 p-2 text-[0.7rem] shadow">
              {layer === "densidade" && <ClassLegend colors={density.colors} breaks={density.breaks} unit={M.densityUnit[f.sensor]}
                decimals={f.sensor === "todos" && hex.data?.granularity === "month" ? 1 : 0}
                note={`${t(M.cellSize, { km2: AREA_KM2[res] })}${res < 6 ? ` (${M.aggregated})` : ""}`} />}
              {layer === "focos" && <FrpLegend colors={points.colors} />}
              {layer === "risco" && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">{risk.order.map((o, i) => <span key={o} className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: risk.colors[i] }} aria-hidden />{o.replace("_", " ")}</span>)}</div>
                  <p className="text-muted-foreground">{M.riskLegend} {fc.data?.forecast_date ? `· ${brDate(fc.data.forecast_date)}` : ""} · {t(M.cellSize, { km2: AREA_KM2[res] })}</p>
                  <p><b>{M.riskTooltip}.</b> <Link href={s.hrefWith("/previsao")} className="text-brand underline-offset-2 hover:underline">{M.toPrevisao}</Link></p>
                </div>
              )}
            </div>

            {/* cell detail (right) */}
            {cellSel && layer === "densidade" && (
              <CellPanel cell={cellSel} res={res} unit={M.densityUnit[f.sensor]} regionKey={region.key} start={start} end={end}
                onClose={() => setFilters({ cell: null })} onUseArea={(poly) => setFilters({ area: poly, cell: null })} />
            )}
          </div>
        )}

        {/* notes under the map */}
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {layer === "focos" && rec.data && (
            <>
              <p>{t(M.pointsWindow, { days: pointDays, start: brDate(rec.data.days[0]?.date), end: brDate(rec.data.days[rec.data.days.length - 1]?.date) })}
                {rec.data.truncated ? ` ${t(M.pointsTruncated, { n: int(rec.data.detections.length) })}` : ""}</p>
              {pointsData.q.MODIS.length === 3 && <p>{t(M.frpComputed, {
                m: pointsData.q.MODIS.map((x) => num(x, 1)).join(" / "), v: pointsData.q.VIIRS.length === 3 ? pointsData.q.VIIRS.map((x) => num(x, 1)).join(" / ") : "—" })}</p>}
            </>
          )}
          {layer === "densidade" && f.category === "coincidentes" && <p>{M.categoryNoteDensity}</p>}
          <p>{M.honesty}</p>
        </div>
      </section>

      <TypedAreaDialog open={typedOpen} onOpenChange={setTypedOpen} bbox={region.bbox}
        onApply={(a) => { setTypedOpen(false); setFilters({ area: a, cell: null }); }} />
    </div>
  );
}

function ClassLegend({ colors, breaks, unit, note, decimals }: { colors: string[]; breaks: number[]; unit: string; note: string; decimals: number }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="leading-3">{M.legend.less}</span>
        {colors.map((c, i) => {
          const b = (k: number) => num(breaks[k] ?? 0, decimals);
          const label = !breaks.length ? "" : i === 0 ? `≤ ${b(0)}` : i === colors.length - 1 ? `> ${b(i - 1)}` : `${b(i - 1)}–${b(i)}`;
          return (
            <span key={i} className="flex flex-col items-start gap-0.5 tabular-nums">
              <span className="h-2.5 w-10 rounded-sm" style={{ background: c }} />
              <span className="text-[0.65rem] text-muted-foreground">{label}</span>
            </span>
          );
        })}
        <span className="leading-3">{M.legend.more}</span>
      </div>
      <p className="text-muted-foreground">{unit} · {note}</p>
    </div>
  );
}

/** FRP legend with the interactive chips for the Focos layer (same state as the sidebar). */
function FrpLegend({ colors }: { colors: string[] }) {
  const { filters, setFilters } = useAppState();
  const all = filters.frp.length === 0;
  return (
    <div className="space-y-1">
      <p className="font-medium">{copy.sidebar.frp}: {copy.sidebar.frpNote}</p>
      <div className="flex flex-wrap gap-1">
        {FRP_ORDER.map((c, i) => {
          const on = all || filters.frp.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on}
              onClick={() => {
                const set = new Set(all ? FRP_ORDER : filters.frp);
                if (set.has(c)) set.delete(c); else set.add(c);
                const next = FRP_ORDER.filter((x) => set.has(x));
                setFilters({ frp: next.length === FRP_ORDER.length || next.length === 0 ? [] : next });
              }}
              className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 pointer-coarse:min-h-11", ring, on ? "border-brand" : "border-border opacity-50")}>
              <span className="size-2.5 rounded-full" style={{ background: colors[i] }} aria-hidden />{copy.sidebar.frpClasses[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CellTable({ rows, unit, loading, layer }: { rows: AggCell[]; unit: string; loading: boolean; layer: Layer }) {
  if (layer !== "densidade") return <EmptyState text={M.table.onlyDensity} />;
  if (loading && !rows.length) return <Loading what="tabela" />;
  if (!rows.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="pb-2 text-left text-xs text-muted-foreground">{M.table.caption} ({unit})</caption>
        <thead><tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-3">{M.table.id}</th><th scope="col" className="py-1 pr-3 text-right">{M.table.count}</th>
          <th scope="col" className="py-1 pr-3 text-right">{M.table.pct}</th><th scope="col" className="py-1">{M.table.dominant}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-1.5 pr-3 font-mono text-xs">{r.id}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(r.value, 0)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{r.percentile}</td>
              <td className="py-1.5">{dominant(r)} <span className="text-xs text-muted-foreground">(MODIS {int(r.modis)} · VIIRS {int(r.viirs)})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellPanel({ cell, res, unit, regionKey, start, end, onClose, onUseArea }: {
  cell: AggCell; res: number; unit: string; regionKey: string; start?: string; end?: string;
  onClose: () => void; onUseArea: (poly: string) => void;
}) {
  const P = M.cellPanel;
  const poly = cellPolygonParam(cellToBoundary(cell.id) as [number, number][]);
  return (
    <aside aria-label={P.title} className="absolute bottom-2 right-14 top-2 z-[550] w-64 overflow-y-auto rounded-lg border border-border bg-panel/95 p-3 text-sm shadow-lg pointer-coarse:right-16">
      <div className="mb-2 flex items-start gap-2">
        <h3 className="font-semibold">{P.title}</h3>
        <button type="button" onClick={onClose} aria-label={P.close} className={cn("ml-auto grid size-7 place-items-center rounded hover:bg-accent", ring)}><X className="size-4" aria-hidden /></button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">{cell.id} · ~{AREA_KM2[res]} km²</p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">{cap(unit)}</dt><dd className="text-right tabular-nums">{num(cell.value, 0)}</dd>
        <dt className="text-muted-foreground">{P.percentile}</dt><dd className="text-right tabular-nums">{cell.percentile}</dd>
        <dt className="text-muted-foreground">{P.modis}</dt><dd className="text-right tabular-nums">{int(cell.modis)}</dd>
        <dt className="text-muted-foreground">{P.viirs}</dt><dd className="text-right tabular-nums">{int(cell.viirs)}</dd>
        {res < 6 && <><dt className="text-muted-foreground">{P.children}</dt><dd className="text-right tabular-nums">{cell.n}</dd></>}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{P.noSeries}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        <a href={csvUrl({ region: regionKey, start, end, polygon: poly })} className={cn("flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-black pointer-coarse:min-h-11", ring)}>
          <Download className="size-4" aria-hidden /> {P.csv}
        </a>
        <button type="button" onClick={() => onUseArea(`poly:${poly}`)} className={cn("rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent pointer-coarse:min-h-11", ring)}>{P.useArea}</button>
      </div>
    </aside>
  );
}

function TypedAreaDialog({ open, onOpenChange, bbox, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; bbox: number[]; onApply: (a: string) => void }) {
  const D = M.draw;
  const [v, setV] = useState<string[]>(bbox.map(String));
  const [err, setErr] = useState(false);
  function apply(e: React.FormEvent) {
    e.preventDefault();
    const a = parseArea(`bbox:${v.join(",")}`);
    if (!a) { setErr(true); return; }
    setErr(false);
    onApply(a);
  }
  const labels = [D.west, D.south, D.east, D.north];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="font-heading">{D.typedTitle}</DialogTitle>
        <DialogDescription>{D.typedDesc}</DialogDescription>
        <form onSubmit={apply} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {labels.map((l, i) => (
              <label key={l} className="text-sm">{l}
                <input inputMode="decimal" value={v[i]} aria-invalid={err}
                  onChange={(e) => setV((x) => x.map((y, j) => (j === i ? e.target.value.replace(",", ".") : y)))}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm" />
              </label>
            ))}
          </div>
          {err && <p role="alert" className="text-xs text-fire">{D.invalid}</p>}
          <button type="submit" className={cn("w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-black", ring)}>{D.apply}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
