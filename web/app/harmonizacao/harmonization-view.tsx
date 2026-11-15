"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import { ErrorBox, Loading, Panel, Toggle } from "@/components/panel";
import { harm as H } from "@/content/copy";
import { MESES_CURTOS, int, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalibrationMetric, HarmonizationResponse } from "@/lib/types";

// Categorical palette validated for the dark surface #141d23 (dataviz validator: band, chroma, CVD, contrast pass).
const COLOR = { modis_raw: "#5b8ff0", viirs_raw: "#e0632a", harmonized: "#1fa58d" } as const;
type SeriesKey = keyof typeof COLOR;
const t = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const label = (y: number, m: number) => `${MESES_CURTOS[m - 1]}/${y}`;

export function HarmonizationView() {
  const { region } = useAppState();
  const [mode, setMode] = useState<"antes" | "depois">("antes");
  const [asTable, setAsTable] = useState(false);
  const q = useApi<HarmonizationResponse>(region ? "/harmonization" : null, { region: region?.key, learn: false });
  const d = q.data;

  const rows = useMemo(() => (d?.series ?? []).map((p) => ({ ...p, x: label(p.year, p.month) })), [d]);
  const overlap = useMemo(() => {
    const o = rows.filter((r) => r.overlap);
    return o.length ? { x1: o[0].x, x2: o[o.length - 1].x } : null;
  }, [rows]);
  const keys: SeriesKey[] = mode === "antes" ? ["modis_raw", "viirs_raw"] : ["harmonized"];

  if (!region) return <Loading what="regiões" />;
  return (
    <div className="space-y-4">
      <Panel title={H.title} subtitle={region.name}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2 text-sm leading-relaxed">{H.intro.map((p) => <p key={p}>{p}</p>)}</div>
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Método em 4 passos">
            {H.steps.map((s, i) => (
              <li key={s.t} className="relative rounded-lg border border-border bg-background p-3">
                <span className="mb-1 inline-grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-black">{i + 1}</span>
                <p className="font-heading text-sm font-semibold">{s.t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
                {i < H.steps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-brand xl:block" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>
      </Panel>

      <Panel title={H.chartTitle} subtitle={`${region.name} · ${H.chartSub}`} pngName={`harmonizacao_${region.key}_${mode}`}
        actions={<>
          <Toggle label={H.toggleLabel} value={mode} onChange={setMode} options={[{ id: "antes", label: H.before }, { id: "depois", label: H.after }]} />
          <button type="button" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent pointer-coarse:min-h-11">{asTable ? H.chart : H.table}</button>
        </>}>
        {q.error ? <ErrorBox error={q.error} onRetry={q.refetch} /> : !d ? <Loading what="séries" height={320} /> : asTable ? (
          <SeriesTable rows={rows} keys={keys} />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
              {keys.map((k) => <span key={k} className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: COLOR[k] }} />{H.series[k]}</span>)}
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-3 w-5 rounded-sm bg-white/10" />{H.overlap}</span>
            </div>
            <div className="h-[340px]" role="img"
              aria-label={`${H.chartTitle}: ${keys.map((k) => H.series[k]).join(", ")}, ${rows[0]?.x} a ${rows[rows.length - 1]?.x}. Use “${H.table}” para os valores.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#26343d" strokeDasharray="0" vertical={false} />
                  {overlap && <ReferenceArea x1={overlap.x1} x2={overlap.x2} fill="#ffffff" fillOpacity={0.05} stroke="none" />}
                  <XAxis dataKey="x" tick={{ fill: "#a9bbc4", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#26343d" }}
                    interval={23} minTickGap={24} />
                  <YAxis tick={{ fill: "#a9bbc4", fontSize: 11 }} tickLine={false} axisLine={false} width={56}
                    tickFormatter={(v: number) => int(v)} />
                  <Tooltip
                    contentStyle={{ background: "#141d23", border: "1px solid #26343d", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#e9f0f3", fontWeight: 600 }} itemStyle={{ color: "#e9f0f3" }}
                    cursor={{ stroke: "#a9bbc4", strokeWidth: 1 }}
                    formatter={(v, name) => [v == null ? "—" : int(Number(v)), H.series[name as SeriesKey] ?? String(name)]} />
                  {keys.map((k) => (
                    <Line key={k} type="monotone" dataKey={k} name={k} stroke={COLOR[k]} strokeWidth={2} dot={false}
                      activeDot={{ r: 4, stroke: "#141d23", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {d.calibration_years.length === 2 && t(H.calibWindow, { a: d.calibration_years[0], b: d.calibration_years[1] })} {d.unit}.
            </p>
          </>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={H.metricsTitle} subtitle={H.metricsSub}>
          {d ? <Metrics metrics={d.metrics} /> : q.error ? null : <Loading what="métricas" />}
        </Panel>
        <Panel title={H.limitsTitle}>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {H.extraLimits.map((l) => <li key={l}>{l}</li>)}
            {d?.limitations.map((l) => <li key={l} className="text-muted-foreground">{l}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function SeriesTable({ rows, keys }: { rows: { x: string; modis_raw?: number | null; viirs_raw?: number | null; harmonized?: number | null }[]; keys: SeriesKey[] }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{H.chartTitle}</caption>
        <thead className="sticky top-0 bg-panel"><tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-3">{H.monthCol}</th>
          {keys.map((k) => <th key={k} scope="col" className="py-1 pr-3 text-right">{H.series[k]}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.x} className="border-t border-border">
              <td className="py-1 pr-3">{r.x}</td>
              {keys.map((k) => <td key={k} className="py-1 pr-3 text-right tabular-nums">{r[k] == null ? "—" : int(r[k] as number)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metrics({ metrics }: { metrics: CalibrationMetric[] }) {
  const methods = ["raw_modis", "linear", "quantile_mapping"].filter((m) => metrics.some((x) => x.method === m));
  const get = (m: string, scope: string) => metrics.find((x) => x.method === m && x.scope === scope);
  const holdout = metrics.filter((x) => x.method === "quantile_mapping" && x.scope.startsWith("holdout="));
  const outside = metrics.filter((x) => x.method === "quantile_mapping" && x.scope.startsWith("outside_window="));
  const cell = "py-1.5 pr-3 text-right tabular-nums";
  return (
    <div className="space-y-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">{H.metricsTitle}</caption>
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1 pr-3">{H.cols.method}</th>
            <th scope="col" className="py-1 pr-3 text-right">{H.cols.r2d}</th>
            <th scope="col" className="py-1 pr-3 text-right">{H.cols.r2m}</th>
            <th scope="col" className="py-1 pr-3 text-right">{H.cols.bias}</th>
            <th scope="col" className="py-1 pr-3 text-right">{H.cols.rmse}</th>
            <th scope="col" className="py-1 text-right">{H.cols.days}</th>
          </tr></thead>
          <tbody>
            {methods.map((m) => {
              const dly = get(m, "loyo_daily"), mon = get(m, "loyo_monthly");
              return (
                <tr key={m} className={cn("border-t border-border", m === "quantile_mapping" && "font-semibold")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">{H.methods[m] ?? m}</th>
                  <td className={cell}>{num(dly?.r2, 2)}</td>
                  <td className={cell}>{num(mon?.r2, 2)}</td>
                  <td className={cell}>{num(dly?.bias, 1)}</td>
                  <td className={cell}>{num(dly?.rmse, 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{int(dly?.overlap_days)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {holdout.length > 0 && <YearTable title={H.perYear} rows={holdout} />}
      {outside.length > 0 && <YearTable title={H.outside} rows={outside} />}
      <p className="text-xs text-muted-foreground">{H.noDeseason}</p>
    </div>
  );
}

function YearTable({ title, rows }: { title: string; rows: CalibrationMetric[] }) {
  return (
    <details className="rounded-lg border border-border p-2">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-3">{H.cols.year}</th><th scope="col" className="py-1 pr-3 text-right">{H.cols.r2}</th>
          <th scope="col" className="py-1 pr-3 text-right">{H.cols.bias}</th><th scope="col" className="py-1 text-right">{H.cols.rmse}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.scope} className="border-t border-border">
              <td className="py-1 pr-3">{r.scope.split("=")[1]}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{num(r.r2, 2)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{num(r.bias, 1)}</td>
              <td className="py-1 text-right tabular-nums">{num(r.rmse, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
