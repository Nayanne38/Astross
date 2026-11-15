"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, ImageDown, MapPin, X } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import {
  AnomalyLegend, CalendarHeatmap, CountLegend, seriesValue, useCountScale, type CalMode, type CalSeries,
} from "@/components/calendar-heatmap";
import { ErrorBox, Loading, Panel, StatCard, Toggle } from "@/components/panel";
import { cal as T } from "@/content/copy";
import { csvUrl } from "@/lib/api";
import { MESES, MESES_CURTOS, addDays, brDate, cap, int, num, signedPct } from "@/lib/format";
import { anomalyBadge } from "@/lib/map-layers";
import { cn } from "@/lib/utils";
import type { CalendarCell, CalendarResponse, Summary } from "@/lib/types";

const t = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const btn = cn("inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent pointer-coarse:min-h-11", ring);
const monthEnd = (y: number, m: number) => addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
const monthStart = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

function badgeTone(b: string) {
  return b === "Acima" ? "bg-fire/20 text-fire" : b === "Abaixo" ? "bg-sky-400/15 text-sky-300" : "bg-brand/15 text-brand";
}

/** Cumulative current year vs. historical median and min–max band (complete years only). */
function useCumulative(cells: CalendarCell[]) {
  return useMemo(() => {
    if (!cells.length) return null;
    const cur = cells[cells.length - 1].year;
    const byYear = new Map<number, number[]>();
    for (const c of cells) {
      const arr = byYear.get(c.year) ?? Array(12).fill(null);
      arr[c.month - 1] = c.value;
      byYear.set(c.year, arr);
    }
    const hist = [...byYear.entries()].filter(([y, a]) => y !== cur && a.every((v) => v !== null)).map(([, a]) => {
      let s = 0;
      return a.map((v) => (s += v as number));
    });
    if (hist.length < 3) return null;
    let s = 0;
    const curArr = (byYear.get(cur) ?? []).map((v) => (v === null ? null : (s += v)));
    const histYears = [...byYear.keys()].filter((y) => y !== cur && byYear.get(y)!.every((v) => v !== null));
    const rows = MESES_CURTOS.map((m, i) => {
      const v = hist.map((h) => h[i]).sort((a, b) => a - b);
      const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
      return { m, band: [v[0], v[v.length - 1]] as [number, number], median: mid, current: curArr[i] ?? null };
    });
    return { rows, cur, a: Math.min(...histYears), b: Math.max(...histYears) };
  }, [cells]);
}

export function CalendarView() {
  const s = useAppState();
  const { region, range, area, palette, classes, invert, meta } = s;
  const router = useRouter();
  const [mode, setMode] = useState<CalMode>("contagem");
  const [series, setSeries] = useState<CalSeries>("harmonizado");
  const [asTable, setAsTable] = useState(false);
  const [selected, setSelected] = useState<CalendarCell | null>(null);
  const [busy, setBusy] = useState(false);
  const pngRef = useRef<HTMLDivElement>(null);
  const base = { region: region?.key, start: range.start, end: range.end, ...area };
  const cal = useApi<CalendarResponse>(region ? "/calendar" : null, { ...base, top_n: 3, learn: true });
  const sum = useApi<Summary>(region ? "/summary" : null, { ...base, learn: false });
  const cells = useMemo(() => cal.data?.cells ?? [], [cal.data]);
  const scale = useCountScale(cells, series, palette, classes, invert);
  const cum = useCumulative(cells);
  const effMode: CalMode = series === "harmonizado" ? mode : "contagem";

  const peak = useMemo(() => {
    const full = cells.filter((c) => !c.is_partial);
    if (!full.length) return null;
    const by = Array.from({ length: 12 }, (_, i) => {
      const v = full.filter((c) => c.month === i + 1).map((c) => c.value);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
    });
    const m = by.indexOf(Math.max(...by));
    return { month: m + 1, mean: by[m] };
  }, [cells]);

  if (!region) return meta === null ? <Loading what="regiões" /> : null;
  const cmp = sum.data?.comparison;
  const badge = anomalyBadge(cmp?.category);
  const learn = cal.data?.learn;
  const first = cells[0], last = cells[cells.length - 1];
  const periodStart = cal.data?.start ?? range.start ?? region.data_start ?? "";
  const periodEnd = cal.data?.end ?? range.end ?? region.data_end ?? "";
  const subtitle = t(T.panelSub, { r: s.committed.area ? "Área personalizada" : region.name, a: first?.year ?? "", b: last?.year ?? "", s: T.seriesSub[series] });

  async function exportPng() {
    if (!pngRef.current) return;
    setBusy(true);
    try {
      const url = await toPng(pngRef.current, { backgroundColor: "#141d23", pixelRatio: 2, cacheBust: true,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.html2pngIgnore !== undefined) });
      const a = document.createElement("a");
      a.href = url;
      a.download = `calendario-queimadas_${region!.key}_${periodStart}_${periodEnd}.png`;
      a.click();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label={T.cardPeak} value={peak ? cap(MESES[peak.month - 1]) : "…"} note={peak ? t(T.cardPeakNote, { v: int(peak.mean) }) : undefined} />
        <StatCard label={T.cardAnomaly} value={cmp ? (cmp.deviation_pct != null ? signedPct(cmp.deviation_pct) : badge) : "…"}
          badge={cmp && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badgeTone(badge))}>{badge}{cmp.percentile != null ? ` · ${num(cmp.percentile, 0)}º percentil` : ""}</span>}
          note={cmp && (cmp.same_days_only
            ? `${cap(MESES[cmp.month - 1])} de ${cmp.year}, dias 1 a ${cmp.days_compared}, comparado aos mesmos dias de ${cmp.n_ref} anos (${cmp.ref_year_min}–${cmp.ref_year_max})${cmp.is_provisional ? " · dados provisórios" : ""}`
            : `${cap(MESES[cmp.month - 1])} de ${cmp.year} vs. ${cmp.n_ref} anos anteriores`)} />
        <StatCard label={T.cardMean} value={sum.data ? int(sum.data.monthly_mean) : "…"} note={T.cardMeanNote} />
      </div>

      {learn?.avisos.length ? (
        <div className="flex flex-wrap gap-2">
          {learn.avisos.map((a) => <p key={a.codigo} className="rounded-md border border-fire/40 bg-fire/10 px-2.5 py-1.5 text-xs">{a.texto}</p>)}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-panel p-3 sm:p-4" aria-labelledby="cal-title">
        <div ref={pngRef} className="bg-panel">
          <div className="mb-3 flex flex-wrap items-start gap-2">
            <div className="min-w-0">
              <h2 id="cal-title" className="text-base font-semibold">{T.panelTitle}</h2>
              <p className="text-xs text-muted-foreground">{subtitle} · {brDate(periodStart)} a {brDate(periodEnd)}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5" data-html2png-ignore>
              <Toggle label={T.seriesLabel} value={series} onChange={(v: CalSeries) => { setSeries(v); }}
                options={(["harmonizado", "modis", "viirs"] as CalSeries[]).map((id) => ({ id, label: T.series[id] }))} />
              <Toggle label={T.modeLabel} value={effMode} onChange={setMode}
                options={[{ id: "contagem", label: T.modes.contagem }, { id: "anomalia", label: T.modes.anomalia }]} />
            </div>
          </div>
          {series !== "harmonizado" && mode === "anomalia" && <p className="mb-2 text-xs text-fire" data-html2png-ignore>{T.anomalyOnlyHarm}</p>}

          {cal.error ? <ErrorBox error={cal.error} onRetry={cal.refetch} /> : !cells.length ? <Loading what="calendário" height={420} /> : asTable ? (
            <CalendarTable cells={cells} />
          ) : (
            <CalendarHeatmap cells={cells} mode={effMode} series={series} palette={palette} classes={classes} invert={invert}
              provisionalFrom={learn?.procedencia.provisional_from} current={cal.data?.current ?? null}
              selected={selected ? selected.year * 100 + selected.month : null} onSelect={setSelected} />
          )}

          <div className="mt-3 flex flex-wrap items-end gap-3">
            {effMode === "contagem" ? <CountLegend breaks={scale.breaks} colors={scale.colors} series={series} /> : <AnomalyLegend />}
          </div>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">{T.notes}</p>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">{T.credit}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-[0.7rem] text-muted-foreground">{T.legendSameBreaks}</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>{asTable ? T.grid : T.table}</button>
            <button type="button" className={btn} onClick={exportPng} disabled={busy || !cells.length}><ImageDown className="size-3.5" aria-hidden /> {T.png}</button>
            <a className={cn(btn, "border-brand bg-brand font-semibold text-black hover:bg-brand/90")} href={csvUrl({ ...base, start: periodStart, end: periodEnd })}>
              <Download className="size-3.5" aria-hidden /> {T.csv}
            </a>
          </div>
        </div>

        {selected && (
          <MonthDetail c={selected} onClose={() => setSelected(null)}
            onMap={() => router.push(s.hrefWith("/", { period: "custom", start: monthStart(selected.year, selected.month), end: minDate(monthEnd(selected.year, selected.month), region.data_end), cell: null }))}
            csv={csvUrl({ region: region.key, ...area, start: monthStart(selected.year, selected.month), end: minDate(monthEnd(selected.year, selected.month), region.data_end) })} />
        )}
      </section>

      {cum && (
        <Panel title={T.cumTitle} subtitle={T.cumSub}>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-[#1fa58d]" />{t(T.cumSeries.current, { y: cum.cur })}</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded border-t-2 border-dashed border-[#a9bbc4]" />{t(T.cumSeries.median, { a: cum.a, b: cum.b })}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-white/10" />{t(T.cumSeries.band, { a: cum.a, b: cum.b })}</span>
          </div>
          <div className="h-[280px]" role="img" aria-label={`${T.cumTitle}: ${cum.cur} vs. mediana e faixa de ${cum.a} a ${cum.b}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cum.rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#26343d" vertical={false} />
                <XAxis dataKey="m" tick={{ fill: "#a9bbc4", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#26343d" }} />
                <YAxis tick={{ fill: "#a9bbc4", fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => int(v)} />
                <Tooltip contentStyle={{ background: "#141d23", border: "1px solid #26343d", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e9f0f3", fontWeight: 600 }} itemStyle={{ color: "#e9f0f3" }}
                  formatter={(v, name) => [Array.isArray(v) ? `${int(v[0] as number)}–${int(v[1] as number)}` : v == null ? "—" : int(Number(v)),
                    name === "band" ? t(T.cumSeries.band, { a: cum.a, b: cum.b }) : name === "median" ? t(T.cumSeries.median, { a: cum.a, b: cum.b }) : t(T.cumSeries.current, { y: cum.cur })]} />
                <Area dataKey="band" name="band" stroke="none" fill="#ffffff" fillOpacity={0.08} isAnimationActive={false} />
                <Line dataKey="median" name="median" stroke="#a9bbc4" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="current" name="current" stroke="#1fa58d" strokeWidth={2} dot={{ r: 3, fill: "#1fa58d", stroke: "#141d23", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{T.cumNote}</p>
        </Panel>
      )}

      {cmp && <p className="text-sm text-muted-foreground">{cmp.sentence}</p>}
    </div>
  );
}

function minDate(a: string, b?: string | null) { return b && b < a ? b : a; }

function MonthDetail({ c, onClose, onMap, csv }: { c: CalendarCell; onClose: () => void; onMap: () => void; csv: string }) {
  const D = T.detail;
  const row = (k: string, v: string) => <><dt className="text-muted-foreground">{k}</dt><dd className="text-right tabular-nums">{v}</dd></>;
  return (
    <div role="region" aria-label={t(D.title, { m: cap(MESES[c.month - 1]), y: c.year })} className="mt-4 rounded-lg border border-border bg-background p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold">{t(D.title, { m: cap(MESES[c.month - 1]), y: c.year })}{c.is_partial ? ` (${T.partial})` : ""}</h3>
        <button type="button" onClick={onClose} aria-label={D.close} className={cn("ml-auto grid size-7 place-items-center rounded hover:bg-accent", ring)}><X className="size-4" aria-hidden /></button>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto_1fr_auto]">
        {row(D.value, int(c.value))}{row(D.perDay, num(c.daily_mean))}
        {row(D.modis, int(c.modis_cell_days))}{row(D.viirs, int(c.viirs_cell_days))}
        {row(D.detections, int(c.hotspot_count))}{row(D.obsDays, String(c.obs_days))}
        {row(D.percentile, c.percentile != null ? num(c.percentile, 0) : "—")}{row(D.deviation, signedPct(c.deviation_pct))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onMap} className={btn}><MapPin className="size-3.5" aria-hidden /> {D.toMap}</button>
        <a href={csv} className={cn(btn, "border-brand bg-brand font-semibold text-black hover:bg-brand/90")}><Download className="size-3.5" aria-hidden /> {D.csv}</a>
      </div>
    </div>
  );
}

function CalendarTable({ cells }: { cells: CalendarCell[] }) {
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{T.panelTitle}</caption>
        <thead className="sticky top-0 bg-panel text-left text-muted-foreground">
          <tr>{T.tableCols.map((h) => <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {[...cells].reverse().map((c) => (
            <tr key={`${c.year}-${c.month}`} className="border-t border-border">
              <th scope="row" className="px-2 py-1 text-left font-normal">{cap(MESES[c.month - 1])} de {c.year}{c.is_partial ? ` (${T.partial})` : ""}</th>
              <td className="px-2 py-1 tabular-nums">{int(c.value)}</td>
              <td className="px-2 py-1 tabular-nums">{num(seriesValue(c, "harmonizado"))}</td>
              <td className="px-2 py-1 tabular-nums">{int(c.modis_cell_days)}</td>
              <td className="px-2 py-1 tabular-nums">{int(c.viirs_cell_days)}</td>
              <td className="px-2 py-1 tabular-nums">{c.obs_days}</td>
              <td className="px-2 py-1 tabular-nums">{c.percentile != null ? num(c.percentile, 0) : "—"}</td>
              <td className="px-2 py-1 tabular-nums">{signedPct(c.deviation_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
