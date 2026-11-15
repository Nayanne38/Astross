"use client";

// Calendar heatmap as a CSS grid of <button> cells (rows = years, newest first; columns = months).
// Roving tabindex: arrow keys move, Home/End jump within the row, Enter/Space selects.
import { useMemo, useRef, useState } from "react";
import { classColors, classOf, divergingColor, quantileBreaks, type PaletteId } from "@/lib/palettes";
import { MESES, MESES_CURTOS, int, num, signedPct } from "@/lib/format";
import { cal as T } from "@/content/copy";
import { cn } from "@/lib/utils";
import type { CalendarCell } from "@/lib/types";

export type CalMode = "contagem" | "anomalia";
export type CalSeries = "harmonizado" | "modis" | "viirs";

const key = (y: number, m: number) => y * 100 + m;

/** Value per day for the chosen series (daily mean keeps partial months comparable with complete ones). */
export function seriesValue(c: CalendarCell, s: CalSeries): number {
  if (s === "harmonizado") return c.daily_mean;
  const v = s === "modis" ? c.modis_cell_days : c.viirs_cell_days;
  return c.obs_days > 0 ? v / c.obs_days : 0;
}

export function useCountScale(cells: CalendarCell[], series: CalSeries, palette: PaletteId, k: number, invert: boolean) {
  return useMemo(() => ({
    breaks: quantileBreaks(cells.map((c) => seriesValue(c, series)), k),
    colors: classColors(palette, k, invert),
  }), [cells, series, palette, k, invert]);
}

export function cellLabel(c: CalendarCell, series: CalSeries, prov: boolean): string {
  const v = series === "harmonizado" ? c.value : series === "modis" ? c.modis_cell_days : c.viirs_cell_days;
  return `${MESES[c.month - 1]} de ${c.year}: ${int(v)} ${T.unit[series]} (${num(seriesValue(c, series))} por dia)`
    + (series === "harmonizado" && c.percentile != null ? `, percentil ${num(c.percentile, 0)} vs. o mesmo mês nos outros anos` : "")
    + (series === "harmonizado" && c.deviation_pct != null ? `, ${signedPct(c.deviation_pct)} vs. anos anteriores` : "")
    + (c.is_partial ? `, ${T.partial} (${c.obs_days} dias)` : "") + (prov ? `, ${T.provisional}` : "") + (c.is_top ? `, ${T.top3}` : "");
}

export function CalendarHeatmap({ cells, mode, series, palette, classes, invert, provisionalFrom, current, selected, onSelect }: {
  cells: CalendarCell[]; mode: CalMode; series: CalSeries; palette: PaletteId; classes: number; invert: boolean;
  provisionalFrom?: string | null; current?: { year: number; month: number } | null;
  selected: number | null; onSelect: (c: CalendarCell) => void;
}) {
  const { breaks, colors } = useCountScale(cells, series, palette, classes, invert);
  const byKey = useMemo(() => new Map(cells.map((c) => [key(c.year, c.month), c])), [cells]);
  const years = useMemo(() => {
    if (!cells.length) return [];
    const ys = cells.map((c) => c.year);
    const out: number[] = [];
    for (let y = Math.max(...ys); y >= Math.min(...ys); y--) out.push(y);
    return out;
  }, [cells]);
  const provKey = provisionalFrom ? Number(provisionalFrom.slice(0, 4)) * 100 + Number(provisionalFrom.slice(5, 7)) : null;
  const last = cells[cells.length - 1];
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const f = focus ?? (last ? { r: years.indexOf(last.year), c: last.month - 1 } : { r: 0, c: 0 });
  const grid = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  function move(r: number, c: number) {
    const nr = Math.max(0, Math.min(years.length - 1, r)), nc = Math.max(0, Math.min(11, c));
    setFocus({ r: nr, c: nc });
    grid.current?.querySelector<HTMLButtonElement>(`[data-rc="${nr}-${nc}"]`)?.focus();
  }
  function onKey(e: React.KeyboardEvent, r: number, c: number) {
    const map: Record<string, [number, number]> = { ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], Home: [r, 0], End: [r, 11] };
    if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
  }
  function showTip(e: React.MouseEvent | React.FocusEvent, text: string) {
    const box = grid.current?.getBoundingClientRect();
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box) return;
    setTip({ text, x: el.left - box.left + el.width / 2, y: el.top - box.top });
  }

  return (
    <div className="relative overflow-x-auto" ref={grid} onMouseLeave={() => setTip(null)}>
      <div role="grid" aria-label={T.gridLabel} aria-readonly className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "2.75rem repeat(12, minmax(0, 1fr))" }}>
        <div role="row" className="contents">
          <span role="columnheader" />
          {MESES_CURTOS.map((m) => <span key={m} role="columnheader" className="pb-0.5 text-center text-[0.7rem] text-muted-foreground">{m}</span>)}
        </div>
        {years.map((y, r) => (
          <div key={y} role="row" className="contents">
            <span role="rowheader" className="pr-1 text-right text-[0.7rem] tabular-nums leading-5 text-muted-foreground">{y}</span>
            {MESES.map((mes, c) => {
              const cell = byKey.get(key(y, c + 1));
              const tab = f.r === r && f.c === c ? 0 : -1;
              if (!cell) {
                return (
                  <button key={c} type="button" role="gridcell" data-rc={`${r}-${c}`} tabIndex={tab} aria-disabled
                    aria-label={`${mes} de ${y}: ${T.noData}`} onKeyDown={(e) => onKey(e, r, c)} onFocus={() => setFocus({ r, c })}
                    className="h-5 rounded-sm border border-dashed border-border focus-visible:outline-2 focus-visible:outline-brand" />
                );
              }
              const prov = provKey !== null && key(y, c + 1) >= provKey;
              const isCurrent = current && current.year === y && current.month === c + 1;
              const color = mode === "anomalia" && series === "harmonizado" ? divergingColor(cell.deviation_pct) : colors[classOf(seriesValue(cell, series), breaks)];
              const label = cellLabel(cell, series, prov);
              const sel = selected === key(y, c + 1);
              return (
                <button key={c} type="button" role="gridcell" data-rc={`${r}-${c}`} tabIndex={tab} aria-label={label} aria-selected={sel}
                  aria-current={isCurrent ? "date" : undefined}
                  onClick={() => { setFocus({ r, c }); onSelect(cell); }}
                  onKeyDown={(e) => onKey(e, r, c)}
                  onFocus={(e) => { setFocus({ r, c }); showTip(e, label); }} onBlur={() => setTip(null)}
                  onMouseEnter={(e) => showTip(e, label)}
                  className={cn("relative h-5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
                    sel && "ring-2 ring-white ring-offset-1 ring-offset-panel")}
                  style={{
                    background: color,
                    backgroundImage: cell.is_partial ? "repeating-linear-gradient(45deg, rgba(0,0,0,.5) 0 2px, transparent 2px 6px)" : undefined,
                    boxShadow: isCurrent ? "inset 0 0 0 2px #e9f0f3" : prov ? "inset 0 0 0 1px rgba(233,240,243,.8)" : undefined,
                  }}>
                  {cell.is_top && <span aria-hidden className="absolute -right-0.5 -top-1 text-[0.6rem] leading-none text-white drop-shadow">▲</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {tip && (
        <div role="presentation" className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-panel px-2 py-1 text-xs shadow-lg"
          style={{ left: tip.x, top: tip.y - 4 }}>{tip.text}</div>
      )}
    </div>
  );
}

export function CountLegend({ breaks, colors, series }: { breaks: number[]; colors: string[]; series: CalSeries }) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="leading-3">{T.less}</span>
        {colors.map((c, i) => (
          <span key={i} className="flex flex-col items-start gap-0.5 tabular-nums">
            <span className="h-3 w-12 rounded-sm" style={{ background: c }} />
            <span className="text-[0.65rem]">
              {i === 0 ? `≤ ${num(breaks[0] ?? 0)}` : i === colors.length - 1 ? `> ${num(breaks[i - 1] ?? 0)}` : `${num(breaks[i - 1] ?? 0)}–${num(breaks[i] ?? 0)}`}
            </span>
          </span>
        ))}
        <span className="leading-3">{T.more}</span>
      </div>
      <p>{T.legendCount[series]}</p>
    </div>
  );
}

export function AnomalyLegend() {
  const items: [string, number | null][] = [["≤ −50%", -60], ["−25%", -30], ["−10%", -15], ["±10%", 0], ["+10%", 15], ["+25%", 30], ["≥ +50%", 60], [T.noRef, null]];
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {items.map(([l, v]) => <span key={l} className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(v) }} />{l}</span>)}
      </div>
      <p>{T.legendAnomaly}</p>
    </div>
  );
}
