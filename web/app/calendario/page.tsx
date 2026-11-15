"use client";
import { NeedsHistory } from "@/components/needs-history";
import { PickRegion } from "@/components/pick-region";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { LearnBox, Panel, State } from "@/components/panel";
import { fmtInt, fmtNum, fmtPct, tpl } from "@/lib/format";
import { classColors, classOf, quantileBreaks } from "@/lib/palettes";
import type { CalendarCell, CalendarResponse } from "@/lib/types";
import { useQ } from "@/lib/use-q";
import { cn } from "@/lib/utils";

type Mode = "contagem" | "anomalia";
type Series = "harmonizado" | "modis" | "viirs";

function val(c: CalendarCell, s: Series) {
  return s === "harmonizado" ? c.daily_mean : s === "modis" ? c.modis_cell_days / Math.max(1, c.obs_days) : c.viirs_cell_days / Math.max(1, c.obs_days);
}

function Inner() {
  const { t, lang, filters: f, meta } = useApp();
  const c = t.cal;
  const [mode, setMode] = useState<Mode>("contagem");
  const [series, setSeries] = useState<Series>("harmonizado");
  const [sel, setSel] = useState<CalendarCell | null>(null);
  const [table, setTable] = useState(false);
  const reg = meta?.regions.find((r) => r.key === f.region);
  const q = useQ<CalendarResponse>("/calendar", { region: f.region, learn: true, nivel: "estudante", bbox: f.bbox?.join(",") }, !!reg);
  const cells = q.data?.cells ?? [];
  const years = [...new Set(cells.map((x) => x.year))].sort();
  const byKey = new Map(cells.map((x) => [`${x.year}-${x.month}`, x]));
  const breaks = quantileBreaks(cells.map((x) => val(x, series)), f.classes);
  const colors = classColors(f.palette, f.classes, f.invert);
  const complete = cells.filter((x) => !x.is_partial);
  const peak = complete.length ? complete.reduce((a, b) => (b.daily_mean > a.daily_mean ? b : a)) : null;
  const mean = complete.length ? complete.reduce((s, x) => s + x.value, 0) / complete.length : null;
  const cur = q.data?.current ?? null;

  function bg(x: CalendarCell | undefined) {
    if (!x) return undefined;
    if (mode === "anomalia") {
      const d = x.deviation_pct;
      if (d === null || d === undefined) return "var(--panel-2)";
      const k = Math.min(1, Math.abs(d) / 100);
      return d < 0 ? `rgb(${40 - 20 * k} ${110 + 90 * k} ${180 + 50 * k})` : `rgb(${200 + 55 * k} ${120 - 60 * k} ${40})`;
    }
    return colors[classOf(val(x, series), breaks)];
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          [c.cardPeak, peak ? `${t.months[peak.month - 1]} ${peak.year}` : "—", peak ? tpl(c.cardPeakNote, { v: fmtInt(peak.value, lang) }) : ""],
          [c.cardAnomaly, cur?.deviation_pct != null ? fmtPct(cur.deviation_pct, lang, 1, true) : "—", cur ? `${t.months[cur.month - 1]} ${cur.year}` : ""],
          [c.cardMean, fmtInt(mean, lang), c.cardMeanNote],
        ].map(([title, v, note]) => (
          <section key={title} className="rounded-xl border border-line bg-panel p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
            {q.isPending ? <div className="skeleton mt-3 h-8 w-32" /> : <div className="fade-in mt-1 font-display text-2xl font-bold tnum">{v}</div>}
            <p className="mt-1 text-xs text-ink-2">{note}</p>
          </section>
        ))}
      </div>

      <Panel title={c.panelTitle} sub={tpl(c.panelSub, { r: reg?.name ?? "", a: String(years[0] ?? ""), b: String(years.at(-1) ?? ""), s: c.seriesSub[series] })}>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label={c.modeLabel}>
            {(["contagem", "anomalia"] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={cn("press px-3 py-1.5 text-sm", mode === m ? "bg-brand font-semibold text-brand-ink" : "bg-panel-2")}>{c.modes[m]}</button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label={c.seriesLabel}>
            {(["harmonizado", "modis", "viirs"] as Series[]).map((m) => (
              <button key={m} aria-pressed={series === m} onClick={() => setSeries(m)} className={cn("press px-3 py-1.5 text-sm", series === m ? "bg-brand font-semibold text-brand-ink" : "bg-panel-2")}>{c.series[m]}</button>
            ))}
          </div>
          <button className="press ml-auto rounded-md border border-line px-3 py-1.5 text-sm" onClick={() => setTable(!table)}>{table ? c.grid : c.table}</button>
        </div>
        {mode === "anomalia" && series !== "harmonizado" && <p className="mb-2 text-xs text-fire">{c.anomalyOnlyHarm}</p>}
        <State q={q}>
          {table ? (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm tnum">
                <thead className="sticky top-0 bg-panel text-left text-xs text-ink-3"><tr>{c.tableCols.map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
                <tbody>
                  {[...cells].reverse().map((x) => (
                    <tr key={`${x.year}-${x.month}`} className="border-t border-line">
                      <td className="px-2 py-1">{t.monthsShort[x.month - 1]} {x.year}</td>
                      <td className="px-2 py-1 text-right">{fmtInt(x.value, lang)}</td>
                      <td className="px-2 py-1 text-right">{fmtNum(x.daily_mean, lang, 1)}</td>
                      <td className="px-2 py-1 text-right">{fmtInt(x.modis_cell_days, lang)}</td>
                      <td className="px-2 py-1 text-right">{fmtInt(x.viirs_cell_days, lang)}</td>
                      <td className="px-2 py-1 text-right">{x.obs_days}</td>
                      <td className="px-2 py-1 text-right">{x.percentile != null ? Math.round(x.percentile) : "—"}</td>
                      <td className="px-2 py-1 text-right">{fmtPct(x.deviation_pct, lang, 1, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto" role="grid" aria-label={c.gridLabel}>
              <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "44px repeat(12, 1fr)" }}>
                <div />
                {t.monthsShort.map((m) => <div key={m} className="text-center text-[11px] text-ink-3">{m}</div>)}
                {[...years].reverse().map((y) => (
                  <div key={y} className="contents">
                    <div className="pr-1 text-right text-[11px] leading-6 text-ink-3 tnum">{y}</div>
                    {Array.from({ length: 12 }, (_, i) => {
                      const x = byKey.get(`${y}-${i + 1}`);
                      return (
                        <button key={i} role="gridcell" disabled={!x} onClick={() => x && setSel(x)}
                          aria-label={x ? tpl(t.copy.ui.cellLabel, { m: t.months[i], y, v: fmtInt(x.value, lang), unit: c.unit[series], d: fmtNum(x.daily_mean, lang, 1) }) : `${t.months[i]} ${y}: ${c.noData}`}
                          className={cn("press h-6 rounded-[3px]", !x && "border border-dashed border-line", x?.is_partial && "opacity-70 [background-image:repeating-linear-gradient(45deg,transparent_0_3px,rgb(0_0_0/.35)_3px_5px)]", sel === x && x && "outline outline-2 outline-white")}
                          style={{ background: bg(x) }}>
                          {x?.is_top && <span className="text-[9px] text-black/70" aria-hidden>▲</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-3">
            <span>{c.less}</span>
            <div className="flex h-2.5 w-40 overflow-hidden rounded">{colors.map((k, i) => <span key={i} className="flex-1" style={{ background: k }} />)}</div>
            <span>{c.more}</span>
          </div>
          <p className="mt-2 text-xs text-ink-3">{mode === "contagem" ? c.legendCount[series] : c.legendAnomaly}</p>
          <p className="mt-1 text-xs text-ink-3">{c.notes}</p>
          <LearnBox learn={q.data?.learn} />
        </State>
      </Panel>

      {sel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setSel(null)}>
          <div className="pop fade-in w-full max-w-sm rounded-xl border border-line bg-panel p-5" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold">{tpl(c.detail.title, { m: t.months[sel.month - 1], y: sel.year })}</h2>
            <dl className="mt-3 space-y-1 text-sm tnum">
              {([
                [c.detail.value, fmtInt(sel.value, lang)], [c.detail.perDay, fmtNum(sel.daily_mean, lang, 1)],
                [c.detail.modis, fmtInt(sel.modis_cell_days, lang)], [c.detail.viirs, fmtInt(sel.viirs_cell_days, lang)],
                [c.detail.detections, fmtInt(sel.hotspot_count, lang)], [c.detail.obsDays, String(sel.obs_days)],
                [c.detail.percentile, sel.percentile != null ? String(Math.round(sel.percentile)) : "—"],
                [c.detail.deviation, fmtPct(sel.deviation_pct, lang, 1, true)],
              ] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-3">{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {sel.is_partial && <p className="mt-2 text-xs text-fire">{c.partial}</p>}
            <button className="btn mt-4 w-full justify-center" onClick={() => setSel(null)}>{c.detail.close}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { live, series, filters } = useApp();
  if (!filters.region || (live && !series)) return <PickRegion what="Calendar" need="series" />;
  return live && !series ? <NeedsHistory /> : <Inner />;
}
