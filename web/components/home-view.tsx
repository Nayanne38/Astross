"use client";
import { useQuery } from "@tanstack/react-query";
import { Download, LocateFixed, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Square, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { csvUrl, getJSON } from "@/lib/api";
import { cellValue, PERIODS, type FrpClass, type Layer } from "@/lib/filters";
import { fmtDate, fmtInt, fmtNum, tpl } from "@/lib/format";
import { classColors, PALETTE_IDS } from "@/lib/palettes";
import { frpClasses } from "@/lib/frp";
import { RISK_COLORS } from "@/lib/risk-colors";
import type { Detection, ForecastResponse, HexCell, HexGridResponse, RecentResponse, Summary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import type { BBox } from "./hex-map";

const HexMap = dynamic(() => import("./hex-map"), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });
const POINT_CAP = 10000;
const WORLD: BBox = [-170, -58, 180, 78];
const FRP_COLORS = ["#f7d13d", "#fb9b06", "#ed6925", "#c4172c"];
const FRP_KEYS: FrpClass[] = ["baixa", "media", "alta", "muito_alta"];

interface World {
  days: number; total: number; latest: string | null; detections: Detection[]; truncated: boolean;
  top_regions: { key: string; name: string; count: number }[];
}

function Card({ title, value, note, loading }: { title: string; value: React.ReactNode; note?: React.ReactNode; loading?: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      {loading ? <div className="skeleton mt-3 h-8 w-32" /> : <div className="fade-in mt-1 font-display text-3xl font-bold tnum">{value}</div>}
      {note && !loading && <p className="mt-1 text-xs text-ink-2">{note}</p>}
    </section>
  );
}

function Tool({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} aria-pressed={active}
      className={cn("press grid size-9 place-items-center rounded-lg border border-line bg-panel/90 backdrop-blur hover:bg-panel-2", active && "border-brand text-brand")}>{children}</button>
  );
}

function Seg<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap overflow-hidden rounded-md border border-line text-xs" role="group">
      {options.map(([v, l]) => (
        <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn("press px-2.5 py-1.5", value === v ? "bg-brand font-semibold text-brand-ink" : "bg-panel-2 hover:bg-line")}>{l}</button>
      ))}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5 text-xs"><span className="font-semibold uppercase tracking-wide text-ink-3">{label}</span>{children}</div>;
}

export function HomeView() {
  const { t, filters: f, setFilters, resetFilters, range, meta } = useApp();
  const c = t.copy;
  const sb = c.sidebar;
  const [conf, setConf] = useState<"" | "nominal" | "high">("");
  const [dn, setDn] = useState<"" | "D" | "N">("");
  const [panel, setPanel] = useState(true);
  const [full, setFull] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [locate, setLocate] = useState(0);
  const [toast, setToast] = useState("");
  const [cell, setCell] = useState<HexCell | null>(null);
  const [dl, setDl] = useState(false);

  const reg = meta?.regions.find((r) => r.key === f.region);
  const mode: "world" | "live" | "full" = !f.region ? "world" : reg?.live ? "live" : "full";
  const layer: Layer = mode === "full" ? f.layer : "focos";
  const [start, end] = range ?? ["", ""];
  const bb = f.bbox?.join(",");
  const days = mode === "world" ? Math.min(f.liveDays, 3) : f.liveDays;
  const ready = mode === "full" && !!range && !!reg;

  const worldQ = useQuery({
    queryKey: ["world", days], enabled: mode === "world", refetchInterval: 10 * 60_000,
    queryFn: async () => (await getJSON<World>("/world", { days, limit: 25000 })).data,
  });
  const liveQ = useQuery({
    queryKey: ["live", f.region, days], enabled: mode === "live",
    queryFn: async () => (await getJSON<RecentResponse>("/live", { region: f.region, days, limit: 30000 })).data,
  });
  const sum = useQuery({
    queryKey: ["summary", f.region, start, end, bb], enabled: ready,
    queryFn: async () => (await getJSON<Summary>("/summary", { region: f.region, start, end, bbox: bb, learn: false })).data,
  });
  const hex = useQuery({
    queryKey: ["hexgrid", f.region, start, end, bb], enabled: ready && layer === "densidade",
    queryFn: async () => (await getJSON<HexGridResponse>("/hexgrid", { region: f.region, start, end, bbox: bb, boundary: true, limit: 12000, learn: false })).data,
  });
  const recQ = useQuery({
    queryKey: ["recent", f.region, bb], enabled: ready && layer === "focos",
    queryFn: async () => (await getJSON<RecentResponse>("/recent", { region: f.region, bbox: bb, days: 7, limit: 30000 })).data,
  });
  const fcq = useQuery({
    queryKey: ["forecast-map", f.region, bb], enabled: ready && layer === "risco",
    queryFn: async () => (await getJSON<ForecastResponse>("/forecast", { region: f.region, bbox: bb, horizon: 7, boundary: true, limit: 8000, learn: false })).data,
  });

  const rawPts: Detection[] = mode === "world" ? worldQ.data?.detections ?? [] : mode === "live" ? liveQ.data?.detections ?? [] : recQ.data?.detections ?? [];
  const box = f.bbox && mode !== "full" ? f.bbox : null;
  const cls = frpClasses(rawPts);
  const filtered = rawPts.filter((d) =>
    (!box || (d.lon >= box[0] && d.lon <= box[2] && d.lat >= box[1] && d.lat <= box[3])) &&
    (f.sensor === "todos" || d.sensor_family.toLowerCase() === f.sensor) &&
    (!conf || d.confidence_class === conf) && (!dn || d.daynight === dn) &&
    (!f.frp.length || f.frp.includes(cls.of(d))));
  const pts = filtered.length > POINT_CAP ? filtered.slice(0, POINT_CAP) : filtered;
  const pending = mode === "world" ? worldQ.isPending : mode === "live" ? liveQ.isPending : layer === "densidade" ? hex.isPending : layer === "focos" ? recQ.isPending : fcq.isPending;

  const view: BBox = reg ? (reg.bbox as BBox) : WORLD;
  const cells = hex.data?.cells ?? [];
  const vals = cells.map((x) => cellValue(x, f.sensor, f.category)).filter((v): v is number => v !== null);
  const colors = classColors(f.palette, f.classes, f.invert);
  const unit = c.map.densityUnit[f.sensor];
  const riskCells = fcq.data?.cells ?? [];
  const riskAvailable = fcq.data?.available ?? false;
  const cmp = sum.data?.comparison;
  const risk = sum.data?.risk_next_7_days;
  const nFilters = [f.region, f.sensor !== "todos", f.frp.length, f.bbox, conf, dn, mode !== "full" && f.liveDays !== 1,
    mode === "full" && (f.category !== "todas" || f.period !== "serie" || f.layer !== "densidade")].filter(Boolean).length;
  const topRegions = worldQ.data?.top_regions.filter((r) => r.count > 0).slice(0, 5) ?? [];

  function clearAll() { resetFilters(); setConf(""); setDn(""); setCell(null); }
  function toggleFull() { setFull((v) => !v); setTimeout(() => window.dispatchEvent(new Event("firetrack:resize")), 60); }
  const onLocate = (m: string) => setToast(m === "ok" ? c.map.geo.you : m === "denied" ? c.map.geo.denied : c.map.geo.unsupported);
  function cellToArea(x: HexCell) {
    if (!x.boundary) return;
    const lats = x.boundary.map((p) => p[0]), lons = x.boundary.map((p) => p[1]);
    setFilters({ bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((n) => +n.toFixed(4)) as BBox });
    setCell(null);
  }
  async function downloadCsv() {
    if (mode !== "full" || !range) return;
    setDl(true);
    try {
      const params: Record<string, string> = layer === "risco" ? { kind: "forecast", region: f.region }
        : { kind: "history", region: f.region, start, end, sensor: f.sensor, category: f.category };
      if (layer !== "risco") { if (f.sensor === "todos") delete params.sensor; if (f.category === "todas") delete params.category; }
      if (bb) params.bbox = bb;
      const r = await fetch(csvUrl(params));
      if (!r.ok) throw new Error();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = `firetrack-${layer}-${f.region}.csv`; a.click();
      URL.revokeObjectURL(a.href);
    } catch { setToast(c.states.error); } finally { setDl(false); }
  }

  const periodLabels = sb.periods as Record<string, string>;

  const filterPanel = (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{sb.filtersTitle}</h2>
        {nFilters > 0 && <button onClick={clearAll} className="text-sm text-brand underline">{sb.clear}</button>}
      </div>
      <Group label={sb.region}>
        <select className="input" value={f.region} onChange={(e) => { setFilters({ region: e.target.value, bbox: null, layer: "densidade" }); setCell(null); }}>
          <option value="">Whole world (no region)</option>
          {Object.entries((meta?.regions ?? []).filter((r) => !r.key.startsWith("sample")).reduce<Record<string, typeof meta extends undefined ? never : NonNullable<typeof meta>["regions"]>>((a, r) => { (a[r.group || "Other"] ??= []).push(r); return a; }, {}))
            .map(([g, rs]) => <optgroup key={g} label={g}>{rs.map((r) => <option key={r.key} value={r.key}>{r.name_en || r.name}</option>)}</optgroup>)}
        </select>
      </Group>

      {mode === "full" ? (
        <>
          <Group label="Layer">
            <Seg value={f.layer} onChange={(v) => { setFilters({ layer: v }); setCell(null); }} options={(["densidade", "focos", "risco"] as Layer[]).map((l) => [l, c.map.layers[l]])} />
          </Group>
          <Group label={sb.period}>
            <select className="input" value={f.period} onChange={(e) => setFilters({ period: e.target.value as typeof f.period })}>
              {PERIODS.map((p) => <option key={p} value={p}>{periodLabels[p]}</option>)}
            </select>
            {f.period === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label>{sb.from}<input type="date" className="input" value={f.from} min={reg?.data_start ?? undefined} max={reg?.data_end ?? undefined} onChange={(e) => setFilters({ from: e.target.value })} /></label>
                <label>{sb.to}<input type="date" className="input" value={f.to} min={reg?.data_start ?? undefined} max={reg?.data_end ?? undefined} onChange={(e) => setFilters({ to: e.target.value })} /></label>
              </div>
            )}
          </Group>
        </>
      ) : (
        <Group label="Time window">
          <Seg value={days} onChange={(v) => setFilters({ liveDays: v })}
            options={(mode === "world" ? [1, 2, 3] : [1, 2, 3, 5]).map((d) => [d, d === 1 ? "24 h" : `${d} days`] as [number, string])} />
        </Group>
      )}

      <Group label={sb.sensor}>
        <Seg value={f.sensor} onChange={(v) => setFilters({ sensor: v })} options={(["todos", "modis", "viirs"] as const).map((s) => [s, sb.sensors[s]])} />
      </Group>
      {mode === "full" && (
        <Group label={sb.category}>
          <select className="input" value={f.category} onChange={(e) => setFilters({ category: e.target.value as typeof f.category })}>
            {(["todas", "modis", "viirs", "coincidentes"] as const).map((k) => <option key={k} value={k}>{sb.categories[k]}</option>)}
          </select>
        </Group>
      )}
      {mode !== "full" && (
        <>
          <Group label="Confidence"><Seg value={conf} onChange={setConf} options={[["", "All"], ["nominal", "Nominal"], ["high", "High"]]} /></Group>
          <Group label="Day / night"><Seg value={dn} onChange={setDn} options={[["", "Both"], ["D", "Day"], ["N", "Night"]]} /></Group>
        </>
      )}
      {(mode !== "full" || layer === "focos") && (
        <Group label={sb.frp}>
          <div className="flex flex-wrap gap-1.5">
            {FRP_KEYS.map((k, i) => {
              const on = f.frp.includes(k);
              return <button key={k} aria-pressed={on} onClick={() => setFilters({ frp: on ? f.frp.filter((x) => x !== k) : [...f.frp, k] })}
                className={cn("press flex items-center gap-1 rounded-full border px-2.5 py-1", on ? "border-brand bg-brand/15" : "border-line bg-panel-2")}>
                <i className="size-2.5 rounded-full" style={{ background: FRP_COLORS[i] }} />{sb.frpClasses[k]}</button>;
            })}
          </div>
          <span className="text-ink-3">{sb.frpNote}</span>
        </Group>
      )}
      {mode === "full" && layer === "densidade" && (
        <Group label={sb.colors}>
          <select className="input" value={f.palette} onChange={(e) => setFilters({ palette: e.target.value as typeof f.palette })}>
            {PALETTE_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--brand)]" checked={f.invert} onChange={(e) => setFilters({ invert: e.target.checked })} />{sb.invert}</label>
          <label className="flex items-center gap-2">{sb.classes}
            <input type="range" min={3} max={9} value={f.classes} onChange={(e) => setFilters({ classes: +e.target.value })} /><b className="tnum">{f.classes}</b></label>
        </Group>
      )}
      <Group label={sb.customArea}>
        <button className={cn("btn-ghost justify-center", drawing && "border-brand text-brand")} onClick={() => setDrawing((v) => !v)}><Square size={14} /> {drawing ? c.map.draw.hintRect : c.map.tools.desenhar}</button>
        {f.bbox && <button className="text-left text-brand underline" onClick={() => setFilters({ bbox: null })}>{sb.clearArea}</button>}
      </Group>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Live · NASA FIRMS</p>
          <h1 className="h1 mt-1">{reg ? (reg.name_en || reg.name) : "Fires around the world, right now"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            {nFilters ? "Filtered view. Use “Clear filters” to go back to everything." : "No filters applied: every heat detection from NASA's MODIS and VIIRS satellites, worldwide. Open the filters to narrow it down."}
          </p>
        </div>
        <button onClick={() => setPanel((v) => !v)} aria-expanded={panel} className="press flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:bg-panel-2">
          <SlidersHorizontal size={15} aria-hidden /> {sb.filtersTitle}
          {nFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-ink">{nFilters}</span>}
        </button>
      </header>

      {mode === "full" ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Card title={f.bbox ? c.cards.focosArea : c.cards.focos} loading={sum.isPending} value={fmtInt(f.bbox ? sum.data?.total_harmonized : sum.data?.total_hotspots, "en")} note={f.bbox ? c.cards.focosAreaNote : c.cards.focosNote} />
          <Card title={c.cards.comparado} loading={sum.isPending}
            value={cmp ? <span className={cmp.deviation_pct !== null && cmp.deviation_pct < 0 ? "text-brand" : "text-fire"}>{fmtNum(cmp.deviation_pct, "en", 1, true)}%</span> : "—"}
            note={cmp ? `${c.ui.badge[cmp.category === "abaixo" || cmp.category === "muito_abaixo" ? "Abaixo" : cmp.category === "normal" ? "Normal" : cmp.category === "indisponivel" ? "Indisponível" : "Acima"]} · ${tpl(c.ui.percentile, { p: Math.round(cmp.percentile ?? 0) })}` : undefined} />
          <Card title={c.cards.risco} loading={sum.isPending} value={risk?.available ? fmtInt(risk.n_high + risk.n_very_high, "en") : c.cards.riscoNA}
            note={risk?.available ? tpl(c.ui.cells, { n: fmtInt(risk.n_cells, "en") }) : risk?.message} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Card title={`Detections · last ${days === 1 ? "24 h" : days + " days"}`} loading={pending}
            value={fmtInt(nFilters ? filtered.length : mode === "world" ? worldQ.data?.total : rawPts.length, "en")}
            note={nFilters ? "Matching your filters" : "Heat detections after quality filters"} />
          <Card title="Latest satellite day" loading={pending}
            value={fmtDate((mode === "world" ? worldQ.data?.latest : liveQ.data?.days.at(-1)?.date) ?? undefined, "en")} note="UTC · the current day is still in progress" />
          {mode === "world" ? (
            <section className="rounded-xl border border-line bg-panel p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Most active regions</h2>
              {worldQ.isPending ? <div className="skeleton mt-3 h-16 w-full" /> : (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {topRegions.map((r) => (
                    <li key={r.key}>
                      <button className="w-full text-left" onClick={() => setFilters({ region: r.key })}>
                        <div className="flex justify-between"><span>{r.name}</span><span className="tnum text-ink-2">{fmtInt(r.count, "en")}</span></div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded bg-panel-2"><div className="h-full origin-left bg-fire" style={{ transform: `scaleX(${r.count / (topRegions[0]?.count || 1)})` }} /></div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <Card title="Historical series" value={reg?.data_start ? "Available" : `Processing${reg?.progress ? " · " + Math.round(reg.progress * 100) + "%" : ""}`}
              note={reg?.data_start ? "Calendar and MODIS + VIIRS harmonization (2003–today) in the tabs above." : "Downloading and harmonizing 2003 to today from NASA FIRMS in the background. It opens automatically when finished."} />
          )}
        </div>
      )}

      <div className={cn("grid gap-4", panel && "lg:grid-cols-[19rem_1fr]")}>
        {panel && <aside className="step-in rounded-xl border border-line bg-panel p-4 lg:sticky lg:top-[60px] lg:max-h-[calc(100dvh-76px)] lg:self-start lg:overflow-y-auto">{filterPanel}</aside>}

        <section className={cn("isolate min-w-0 rounded-xl border border-line bg-panel", full && "fixed inset-0 z-[2000] flex flex-col rounded-none")}>
          <div className={cn("relative", full ? "flex-1" : "h-[68dvh] min-h-[420px]")}>
            <HexMap layer={layer} cells={cells} points={pts} risk={riskCells} filters={f} bbox={view} lang="en" unit={unit}
              riskLabels={t.prev.classes} pointLabels={{ day: c.map.tooltip.day, night: c.map.tooltip.night, confidence: c.map.tooltip.confidence, disclaimer: c.map.pointDisclaimer }}
              drawing={drawing} onDraw={(b) => { setFilters({ bbox: b }); setDrawing(false); }} locateTrigger={locate} onLocate={onLocate} onCell={setCell} />
            {pending && <div className="skeleton absolute inset-0 z-[500] opacity-40" aria-busy />}
            {(worldQ.isError || liveQ.isError) && <div role="alert" className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-lg border border-bad bg-panel px-3 py-2 text-sm">Live data is unavailable right now. Try again in a minute.</div>}

            <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
              <Tool label={drawing ? c.map.draw.hintRect : c.map.tools.desenhar} active={drawing} onClick={() => setDrawing((v) => !v)}><Square size={16} /></Tool>
              {f.bbox && <Tool label={c.map.draw.clear} onClick={() => setFilters({ bbox: null })}><X size={16} /></Tool>}
              <Tool label={c.map.tools.localizacao} onClick={() => setLocate((n) => n + 1)}><LocateFixed size={16} /></Tool>
              <Tool label={c.map.tools.reiniciar} onClick={() => window.dispatchEvent(new Event("firetrack:reset"))}><RotateCcw size={16} /></Tool>
              <Tool label={full ? c.map.tools.sairTelaCheia : c.map.tools.telaCheia} onClick={toggleFull}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</Tool>
              {mode === "full" && <Tool label={c.map.tools.csv} onClick={downloadCsv}><Download size={16} className={dl ? "animate-pulse" : ""} /></Tool>}
            </div>
            {toast && <button onClick={() => setToast("")} className="fade-in absolute bottom-16 left-1/2 z-[1000] -translate-x-1/2 rounded-lg border border-line bg-panel px-3 py-2 text-sm" role="status">{toast}</button>}

            <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] max-w-[70%] rounded-lg border border-line bg-panel/90 p-2 text-[11px]">
              {layer === "densidade" && (
                <>
                  <div className="mb-1 text-ink-2">{unit}</div>
                  <div className="flex h-2.5 w-44 overflow-hidden rounded">{colors.map((col, i) => <span key={i} className="flex-1" style={{ background: col }} />)}</div>
                  <div className="mt-0.5 flex justify-between text-ink-3 tnum"><span>{c.map.legend.less} ({fmtInt(vals.length ? Math.min(...vals) : 0, "en")})</span><span>{c.map.legend.more} ({fmtInt(vals.length ? Math.max(...vals) : 0, "en")})</span></div>
                  {hex.data?.n_cells && hex.data.n_cells > cells.length && <div className="mt-1 text-ink-3">{tpl(c.map.capBanner, { n: fmtInt(cells.length, "en"), total: fmtInt(hex.data.n_cells, "en") })}</div>}
                </>
              )}
              {layer === "focos" && (
                <>
                  <div className="mb-1 text-ink-2">Fire radiative power (FRP)</div>
                  <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
                    {FRP_KEYS.map((k, i) => <span key={k} className="flex items-center gap-1"><i className="size-2.5 rounded-full" style={{ background: FRP_COLORS[i] }} />{sb.frpClasses[k]}</span>)}
                  </div>
                  <div className="text-ink-3">○ MODIS · ● VIIRS</div>
                  {filtered.length > pts.length && <div className="text-ink-3">Showing the {fmtInt(pts.length, "en")} most intense of {fmtInt(filtered.length, "en")} detections.</div>}
                  {!pending && !pts.length && <div className="text-fire">{nFilters ? "No detections match these filters." : c.states.empty}</div>}
                </>
              )}
              {layer === "risco" && (
                <>
                  <div className="mb-1 text-ink-2">{c.map.riskLegend}</div>
                  {riskAvailable ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {Object.keys(RISK_COLORS).map((k) => <span key={k} className="flex items-center gap-1"><i className="size-2.5 rounded-sm" style={{ background: RISK_COLORS[k] }} />{t.prev.classes[k]}</span>)}
                    </div>
                  ) : <div className="text-fire">{fcq.isPending ? "…" : c.map.riskDisabled}</div>}
                  <div className="mt-1 text-ink-3">{c.map.riskTooltip}</div>
                </>
              )}
            </div>

            {cell && (
              <aside className="fade-in absolute bottom-6 right-3 z-[1000] w-64 rounded-xl border border-line bg-panel p-3 text-sm" aria-label={c.map.cellPanel.title}>
                <div className="mb-1 flex items-center"><b className="mr-auto">{c.map.cellPanel.title}</b><button aria-label={c.map.cellPanel.close} onClick={() => setCell(null)}><X size={14} /></button></div>
                <dl className="space-y-0.5 tnum">
                  <div className="flex justify-between"><dt className="text-ink-3">{c.map.cellPanel.modis}</dt><dd>{fmtInt(cell.modis_count, "en")}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-3">{c.map.cellPanel.viirs}</dt><dd>{fmtInt(cell.viirs_count, "en")}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-3">{unit.split(" (")[0]}</dt><dd>{fmtInt(cell.value, "en")}</dd></div>
                </dl>
                <div className="mt-2 flex gap-2 text-xs">
                  <a className="btn-ghost flex-1 justify-center" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${cell.lat},${cell.lon}`}>Google Maps</a>
                  <a className="btn-ghost flex-1 justify-center" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/@${cell.lat},${cell.lon},15z/data=!3m1!1e3`}>Satellite</a>
                </div>
                <button className="btn mt-2 w-full justify-center" onClick={() => cellToArea(cell)}>{c.map.cellPanel.useArea}</button>
              </aside>
            )}
          </div>
          <p className="border-t border-line p-3 text-xs text-ink-3">
            A heat detection seen by satellite is not necessarily a confirmed fire: it can be a controlled burn or an industrial source. Source: NASA FIRMS.
            {range && layer === "densidade" && <span className="tnum"> ({fmtDate(start, "en")} – {fmtDate(end, "en")})</span>}
            {f.bbox && <span className="block">{sb.delimCustomBbox}</span>}
          </p>
        </section>
      </div>

      <p className="text-sm text-ink-2">
        Looking for history? Pick a region in the <Link className="text-brand underline" href="/calendario">calendar</Link> or the{" "}
        <Link className="text-brand underline" href="/harmonizacao">MODIS + VIIRS harmonization</Link> pages.
      </p>
    </div>
  );
}
