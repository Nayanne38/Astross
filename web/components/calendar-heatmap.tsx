"use client";

import { useMemo } from "react";
import { classColors, classOf, divergingColor, quantileBreaks, type PaletteId } from "@/lib/palettes";
import { MESES, MESES_CURTOS, int, num, signedPct } from "@/lib/format";
import type { CalendarCell } from "@/lib/types";

export type CalMode = "contagem" | "anomalia";

function key(y: number, m: number) { return y * 100 + m; }

export function useCountScale(cells: CalendarCell[], palette: PaletteId, k: number, invert: boolean) {
  return useMemo(() => {
    // daily mean makes partial months comparable with complete ones
    const breaks = quantileBreaks(cells.map((c) => c.daily_mean), k);
    return { breaks, colors: classColors(palette, k, invert) };
  }, [cells, palette, k, invert]);
}

export function CalendarHeatmap({ cells, mode, palette, classes, invert, provisionalFrom }: {
  cells: CalendarCell[]; mode: CalMode; palette: PaletteId; classes: number; invert: boolean; provisionalFrom?: string | null;
}) {
  const { breaks, colors } = useCountScale(cells, palette, classes, invert);
  const byKey = useMemo(() => new Map(cells.map((c) => [key(c.year, c.month), c])), [cells]);
  const years = useMemo(() => [...new Set(cells.map((c) => c.year))].sort((a, b) => b - a), [cells]);
  const provKey = provisionalFrom ? Number(provisionalFrom.slice(0, 4)) * 100 + Number(provisionalFrom.slice(5, 7)) : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-[0.7rem]" aria-label="Calendário de detecções por mês e ano">
        <thead>
          <tr>
            <th scope="col" className="w-12" />
            {MESES_CURTOS.map((m) => <th key={m} scope="col" className="font-normal text-muted-foreground">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <th scope="row" className="pr-1 text-right font-normal tabular-nums text-muted-foreground">{y}</th>
              {MESES.map((mesNome, i) => {
                const c = byKey.get(key(y, i + 1));
                if (!c) return <td key={i} className="h-5 rounded-sm bg-background/40" aria-label={`${mesNome} de ${y}: sem dados`} />;
                const color = mode === "contagem" ? colors[classOf(c.daily_mean, breaks)] : divergingColor(c.deviation_pct);
                const prov = provKey !== null && key(y, i + 1) >= provKey;
                const label = `${mesNome} de ${y}: ${int(c.value)} células-dia com detecção (${num(c.daily_mean)} por dia)` +
                  (c.deviation_pct != null ? `, ${signedPct(c.deviation_pct)} vs. média dos anos anteriores` : "") +
                  (c.percentile != null ? `, percentil ${num(c.percentile, 0)}` : "") +
                  (c.is_partial ? `, mês incompleto (${c.obs_days} dias)` : "") + (prov ? ", dados provisórios" : "");
                return (
                  <td key={i} title={label} aria-label={label}
                    className="h-5 rounded-sm"
                    style={{
                      background: color,
                      backgroundImage: c.is_partial ? "repeating-linear-gradient(45deg, rgba(0,0,0,.45) 0 2px, transparent 2px 6px)" : undefined,
                      outline: prov ? "1px dashed #e6eef1" : c.is_top ? "1px solid #3fd0b5" : undefined,
                      outlineOffset: -1,
                    }} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CountLegend({ breaks, colors }: { breaks: number[]; colors: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>menos</span>
      <div className="flex">{colors.map((c, i) => (
        <span key={c + i} className="h-3 w-7" style={{ background: c }}
          title={i === 0 ? `até ${num(breaks[0])} por dia` : i < breaks.length ? `${num(breaks[i - 1])}–${num(breaks[i])} por dia` : `acima de ${num(breaks[breaks.length - 1])} por dia`} />
      ))}</div>
      <span>mais</span>
      <span className="ml-2">(média de células-dia com detecção por dia; classes por quantil)</span>
    </div>
  );
}

export function AnomalyLegend() {
  const items: [string, number | null][] = [["≤ −50%", -60], ["−25%", -30], ["−10%", -15], ["±10%", 0], ["+10%", 15], ["+25%", 30], ["≥ +50%", 60], ["sem referência", null]];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {items.map(([l, v]) => <span key={l} className="flex items-center gap-1"><span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(v) }} />{l}</span>)}
      <span className="ml-1">(vs. média do mesmo mês nos anos anteriores)</span>
    </div>
  );
}
