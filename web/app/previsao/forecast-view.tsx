"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useApi, useAppState } from "@/components/app-state";
import { ErrorBox, Loading, Panel, Pill, StatCard } from "@/components/panel";
import type { MapHex } from "@/components/hex-map";
import { copy, prev as P } from "@/content/copy";
import { brDate, int, num } from "@/lib/format";
import { classColors } from "@/lib/palettes";
import { AREA_KM2, aggregateRisk, displayRes } from "@/lib/map-layers";
import type { ForecastResponse } from "@/lib/types";

const ORDER = ["baixo", "moderado", "alto", "muito_alto"];
const HEX_CAP = 3000;
const t = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const noop = () => {};

const HexMap = dynamic(() => import("@/components/hex-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">{copy.states.loading} mapa…</div>,
});

type Metrics = Record<string, unknown> & { baselines?: Record<string, Record<string, number>> };

export function ForecastView() {
  const { region, area, palette, invert } = useAppState();
  const [zoom, setZoom] = useState(5);
  const [asTable, setAsTable] = useState(false);
  const res = displayRes(zoom);
  const q = useApi<ForecastResponse>(region ? "/forecast" : null,
    { region: region?.key, ...area, horizon: 7, limit: 60000, boundary: false, learn: false, fallback: true });
  const d = q.data;
  const fb = d && !d.available ? d.fallback : null;

  const layer = useMemo(() => {
    const colors = classColors(palette, 4, invert);
    let cells: { cell_id: string; probability: number; risk_class: string }[] = [];
    if (d?.available) cells = d.cells;
    else if (fb) cells = fb.cells.map((c) => ({ cell_id: c.cell_id, probability: c.frequency, risk_class: c.risk_class }));
    const all = aggregateRisk(cells, res);
    const hexes: MapHex[] = all.slice(0, HEX_CAP).map((a) => {
      const k = Math.max(0, ORDER.indexOf(a.cls));
      return {
        id: a.id, color: colors[k], opacity: 0.55 + 0.4 * (k / 3),
        tooltip: d?.available
          ? `<b>${num(a.p * 100, 0)}%</b> · ${P.classes[a.cls] ?? a.cls}<br/><i>${P.always}</i>`
          : `<b>${num(a.p * 100, 0)}% dos anos</b> com detecção · ${P.classes[a.cls] ?? a.cls}<br/><i>${P.fallbackTitle}</i>`,
      };
    });
    return { all, hexes, colors };
  }, [d, fb, res, palette, invert]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of d?.cells ?? []) c[x.risk_class] = (c[x.risk_class] ?? 0) + 1;
    return c;
  }, [d]);

  if (!region) return <Loading what="regiões" />;
  const m = (d?.metrics ?? null) as Metrics | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fire/40 bg-fire/10 px-4 py-2 text-sm">
        <strong>{P.always}</strong>
        <span className="text-muted-foreground">{d?.disclaimer}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {ORDER.slice().reverse().map((c) => (
          <StatCard key={c} label={`Células: risco ${P.classes[c].toLowerCase()}`} value={d?.available ? int(counts[c] ?? 0) : "—"}
            note={d?.available ? `de ${int(d.cells.length)} hexágonos de ~36 km²` : undefined} />
        ))}
      </div>

      <Panel title={d?.available ? P.title : P.fallbackTitle} pngName={`previsao_${region.key}`}
        subtitle={d?.available ? t(P.model, { v: d.model_version ?? "—", d: brDate(d.forecast_date) }) : region.name}
        actions={<>
          <label className="flex items-center gap-1.5 text-xs">{P.horizon}
            <select className="rounded-md border border-input bg-background px-2 py-1 text-xs" value={7} onChange={noop} aria-describedby="h-only">
              <option value={7}>7 dias</option>
            </select>
          </label>
          <button type="button" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent pointer-coarse:min-h-11">{asTable ? copy.map.table.hide : P.table}</button>
        </>}>
        <p id="h-only" className="sr-only">{P.horizonOnly}</p>
        {q.error ? <ErrorBox error={q.error} onRetry={q.refetch} /> : !d ? <Loading what="previsão" height={400} /> : asTable ? (
          <RiskTable rows={layer.all.slice(0, 20)} />
        ) : (
          <div className="relative h-[50vh] min-h-[320px] overflow-hidden rounded-lg lg:h-[60vh]">
            <HexMap bbox={region.bbox} area={null} basemap="escuro" drawMode={null} resetKey={0}
              hexes={layer.hexes} points={[]} onZoom={setZoom} onDrawn={noop} onDrawCancel={noop} onTileError={noop} />
            <div className="absolute bottom-2 left-2 z-[500] max-w-[min(420px,80%)] space-y-1 rounded-lg border border-border bg-panel/95 p-2 text-[0.7rem] shadow">
              <p className="font-medium">{d.available ? t(P.legendTitle, { h: d.horizon_days }) : fb?.label}</p>
              <div className="flex flex-wrap gap-2">
                {ORDER.map((c, i) => <span key={c} className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: layer.colors[i] }} aria-hidden />{P.classes[c]}</span>)}
              </div>
              <p className="text-muted-foreground">Hexágonos de ~{AREA_KM2[res]} km²{res < 6 ? " (maior valor entre os contidos)" : ""} · {P.always}</p>
            </div>
          </div>
        )}
        {fb && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(P.fallbackNote, { a: fb.ref_year_min, b: fb.ref_year_max, t: Object.values(fb.thresholds).map((x) => `${num(x * 100, 0)}%`).join(" / ") })}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{P.horizonOnly}</p>
      </Panel>

      {d?.available && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={P.metricsTitle}>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["roc_auc", "pr_auc", "brier"] as const).map((k) => {
                const v = typeof m?.[k] === "number" ? (m[k] as number) : null;
                return <StatCard key={k} label={P.metric[k]} value={v == null ? P.noMetrics : num(v, 3)} note={P.metricHelp[k]}
                  badge={v == null ? <Pill className="bg-fire/15 text-fire">sem dados</Pill> : undefined} />;
              })}
            </div>
            {!m && <p className="mt-3 text-sm">{P.noMetricsNote}</p>}
          </Panel>
          <Panel title={P.baselinesTitle}>
            <ul className="space-y-3 text-sm">
              {Object.keys(P.baselines).map((b) => {
                const base = m?.baselines?.[b];
                const model = typeof m?.roc_auc === "number" ? (m.roc_auc as number) : null;
                const beats = base && model != null && typeof base.roc_auc === "number" ? model > base.roc_auc : null;
                return (
                  <li key={b} className="rounded-lg border border-border p-3">
                    <p className="font-medium">{P.baselines[b]}</p>
                    <p className={beats === false ? "font-semibold text-fire" : "text-muted-foreground"}>
                      {beats === null ? P.baselineNA : beats ? `${P.beats} (ROC-AUC ${num(model, 3)} vs ${num(base!.roc_auc, 3)})` : `${P.notBeats} (ROC-AUC ${num(model, 3)} vs ${num(base!.roc_auc, 3)})`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

function RiskTable({ rows }: { rows: { id: string; p: number; cls: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="pb-2 text-left text-xs text-muted-foreground">{P.tableCaption}</caption>
        <thead><tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-3">{P.tableCols.id}</th><th scope="col" className="py-1 pr-3 text-right">{P.tableCols.p}</th><th scope="col" className="py-1">{P.tableCols.cls}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-1.5 pr-3 font-mono text-xs">{r.id}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{num(r.p * 100, 0)}%</td>
              <td className="py-1.5">{P.classes[r.cls] ?? r.cls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
