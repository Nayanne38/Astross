"use client";
import { NeedsHistory } from "@/components/needs-history";
import { PickRegion } from "@/components/pick-region";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/app-state";
import { LearnBox, Panel, State } from "@/components/panel";
import { fmtInt, fmtNum, tpl } from "@/lib/format";
import type { HarmonizationResponse } from "@/lib/types";
import { useQ } from "@/lib/use-q";
import { cn } from "@/lib/utils";

function Inner() {
  const { t, lang, filters: f, prefs } = useApp();
  const h = t.harm;
  const [after, setAfter] = useState(true);
  const [table, setTable] = useState(false);
  const q = useQ<HarmonizationResponse>("/harmonization", { region: f.region, learn: true, nivel: "estudante" });
  const d = q.data;
  const series = (d?.series ?? []).map((p) => ({ ...p, label: `${p.year}-${String(p.month).padStart(2, "0")}` }));
  const col = prefs.colorblind ? ["#00224e", "#e4cf5b", "#8a8779"] : ["#ff7a2f", "#3fd0b5", "#ffffff"];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{h.title}</h1>
      <div className="space-y-2 text-ink-2">{h.intro.map((p) => <p key={p}>{p}</p>)}</div>
      <ol className="grid gap-3 md:grid-cols-4">
        {h.steps.map((s, i) => (
          <li key={s.t} className="rounded-xl border border-line bg-panel p-3">
            <div className="font-display text-2xl font-bold text-brand">{i + 1}</div>
            <b>{s.t}</b><p className="text-sm text-ink-2">{s.d}</p>
          </li>
        ))}
      </ol>

      <Panel title={h.chartTitle} sub={h.chartSub}>
        <div className="mb-3 flex gap-2">
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label={h.toggleLabel}>
            {[false, true].map((v) => (
              <button key={String(v)} aria-pressed={after === v} onClick={() => setAfter(v)} className={cn("press px-3 py-1.5 text-sm", after === v ? "bg-brand font-semibold text-brand-ink" : "bg-panel-2")}>{v ? h.after : h.before}</button>
            ))}
          </div>
          <button className="press ml-auto rounded-md border border-line px-3 py-1.5 text-sm" onClick={() => setTable(!table)}>{table ? h.chart : h.table}</button>
        </div>
        <State q={q}>
          {table ? (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm tnum"><thead className="sticky top-0 bg-panel text-left text-xs text-ink-3"><tr><th>{h.monthCol}</th><th className="text-right">MODIS</th><th className="text-right">VIIRS</th><th className="text-right">{h.series.harmonized}</th></tr></thead>
                <tbody>{series.map((p) => <tr key={p.label} className="border-t border-line"><td>{p.label}</td><td className="text-right">{fmtInt(p.modis_raw, lang)}</td><td className="text-right">{fmtInt(p.viirs_raw, lang)}</td><td className="text-right">{fmtInt(p.harmonized, lang)}</td></tr>)}</tbody></table>
            </div>
          ) : (
            <div className="h-80" role="img" aria-label={h.chartTitle}>
              <ResponsiveContainer>
                <LineChart data={series}>
                  <CartesianGrid stroke="#233740" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "#a9bcc2", fontSize: 11 }} minTickGap={40} />
                  <YAxis tick={{ fill: "#a9bcc2", fontSize: 11 }} width={56} tickFormatter={(v: number) => fmtInt(v, lang)} />
                  <Tooltip contentStyle={{ background: "#111a1e", border: "1px solid #233740" }} formatter={(v) => fmtInt(Number(v), lang)} />
                  <Legend />
                  {!after && <Line dataKey="modis_raw" name={h.series.modis_raw} stroke={col[0]} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />}
                  {!after && <Line dataKey="viirs_raw" name={h.series.viirs_raw} stroke={col[1]} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />}
                  {after && <Line dataKey="harmonized" name={h.series.harmonized} stroke={col[2]} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {d?.overlap_start && <p className="mt-2 text-xs text-ink-3">{h.overlap}: {d.overlap_start} – {d.overlap_end}. {tpl(h.calibWindow, { a: String(d.calibration_years[0] ?? ""), b: String(d.calibration_years.at(-1) ?? "") })}</p>}
        </State>
      </Panel>

      <Panel title={h.metricsTitle} sub={h.metricsSub}>
        <State q={q}>
          <table className="w-full text-sm tnum">
            <thead className="text-left text-xs text-ink-3"><tr><th>{h.cols.method}</th><th className="text-right">{h.cols.r2d}</th><th className="text-right">{h.cols.bias}</th><th className="text-right">{h.cols.rmse}</th><th className="text-right">{h.cols.days}</th></tr></thead>
            <tbody>
              {(d?.metrics ?? []).map((m, i) => (
                <tr key={i} className="border-t border-line"><td>{h.methods[m.method] ?? m.method} <span className="text-ink-3">({m.scope})</span></td>
                  <td className="text-right">{fmtNum(m.r2, lang, 2)}</td><td className="text-right">{fmtNum(m.bias, lang, 2)}</td><td className="text-right">{fmtNum(m.rmse, lang, 2)}</td><td className="text-right">{fmtInt(m.overlap_days, lang)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-3">{h.noDeseason}</p>
          <LearnBox learn={d?.learn} />
        </State>
      </Panel>

      <Panel title={h.limitsTitle} png={false}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          {[...(lang === "pt" ? d?.limitations ?? [] : d?.limitations ?? []), ...h.extraLimits].map((x) => <li key={x}>{x}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

export default function Page() {
  const { live, series, filters } = useApp();
  if (!filters.region || (live && !series)) return <PickRegion what="Harmonization" need="series" />;
  return live && !series ? <NeedsHistory /> : <Inner />;
}
