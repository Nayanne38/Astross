"use client";
import { NeedsHistory } from "@/components/needs-history";
import { PickRegion } from "@/components/pick-region";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import InsightCard from "@/components/InsightCard";
import { LearnBox, Panel, State } from "@/components/panel";
import { RISK_COLORS } from "@/lib/risk-colors";
import { fmtDate, fmtInt, fmtNum, fmtPct, tpl } from "@/lib/format";
import type { ForecastResponse, RecentResponse } from "@/lib/types";
import { useQ } from "@/lib/use-q";

const RiskMap = dynamic(() => import("@/components/risk-map"), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

const WORLD: [number, number, number, number] = [-170, -58, 180, 78];

function Inner() {
  const { t, lang, filters: f, meta } = useApp();
  const p = t.prev;
  const [zoom, setZoom] = useState(true);    // once a region is chosen the map fits it; "Show the whole world" is one click away
  const [fires, setFires] = useState(true);
  const reg = meta?.regions.find((r) => r.key === f.region);
  const q = useQ<ForecastResponse>(reg?.live ? "/forecast/live" : "/forecast", reg?.live ? { region: f.region, limit: 6000 } : { region: f.region, horizon: 7, limit: 6000, learn: true, nivel: "estudante" }, !!reg);
  const live = useQ<RecentResponse>("/live", { region: f.region, days: 2, limit: 8000 }, !!reg);
  const d = q.data;
  const m = d?.metrics;
  const counts = (d?.cells ?? []).reduce<Record<string, number>>((a, c) => ({ ...a, [c.risk_class]: (a[c.risk_class] ?? 0) + 1 }), {});
  const top = [...(d?.cells ?? [])].sort((a, b) => b.probability - a.probability).slice(0, 20);
  const fb = d?.fallback;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{p.title}</h1>
      <p className="rounded-lg border border-fire/50 bg-panel p-3 text-sm">{p.always} {d?.disclaimer}</p>
      <State q={q}>
        {d?.available && reg ? (
          <>
            <Panel title={tpl(p.legendTitle, { h: d.horizon_days })} sub={tpl(p.model, { v: d.model_version ?? "", d: fmtDate(d.forecast_date, lang) })}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-3">{reg.live ? `${reg.name_en || reg.name}: baseline from the last 5 days of detections (trained model not available here yet)` : `${reg.name_en || reg.name}: trained per-cell model`}</span>
                <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={fires} onChange={() => setFires((v) => !v)} />Detected fires, last 2 days{live.data ? ` (${fmtInt(live.data.detections.length, lang)})` : ""}</label>
                <button className="btn-ghost !py-1" onClick={() => setZoom((v) => !v)}>{zoom ? "Show the whole world" : `Zoom to ${reg.name_en || reg.name}`}</button>
              </div>
              <div className="h-[50dvh] min-h-[320px]"><RiskMap cells={d.cells} bbox={zoom ? reg.bbox : WORLD} lang={lang} labels={p.classes} detections={fires ? live.data?.detections : []} /></div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {Object.keys(RISK_COLORS).map((k) => (
                  <span key={k} className="flex items-center gap-1.5"><i className="size-3 rounded-sm" style={{ background: RISK_COLORS[k] }} />{p.classes[k]} <b className="tnum">{fmtInt(counts[k] ?? 0, lang)}</b></span>
                ))}
              </div>
            </Panel>
            <Panel title={p.tableCaption} png={false}>
              <table className="w-full text-sm tnum"><thead className="text-left text-xs text-ink-3"><tr><th>{p.tableCols.id}</th><th className="text-right">{p.tableCols.p}</th><th>{p.tableCols.cls}</th></tr></thead>
                <tbody>{top.map((c) => <tr key={c.cell_id} className="border-t border-line"><td className="font-mono text-xs">{c.cell_id}</td><td className="text-right">{fmtPct(c.probability * 100, lang, 1)}</td><td className="pl-3">{p.classes[c.risk_class]}</td></tr>)}</tbody></table>
            </Panel>
          </>
        ) : fb ? (
          <Panel title={p.fallbackTitle} png={false}>
            <p className="text-sm text-ink-2">{tpl(p.fallbackNote, { a: fb.ref_year_min, b: fb.ref_year_max, t: fb.thresholds.join(", ") })}</p>
            <p className="mt-2 text-sm tnum">{fmtInt(fb.cells.length, lang)} {t.copy.ui.cells.replace("{n}", "").trim()}</p>
          </Panel>
        ) : null}

        <Panel title={p.metricsTitle} png={false}>
          {m ? (
            <table className="w-full text-sm tnum">
              <thead className="text-left text-xs text-ink-3"><tr><th /><th className="text-right">ROC-AUC</th><th className="text-right">PR-AUC</th><th className="text-right">Brier</th></tr></thead>
              <tbody>
                {([["model", "Model " + m.model_version], ["climatology", p.baselines.climatologia], ["persistence", p.baselines.persistencia]] as const).map(([k, label]) => (
                  <tr key={k} className="border-t border-line"><td>{label}</td>
                    <td className="text-right">{fmtNum(m.metrics[k].roc_auc, lang, 3)}</td><td className="text-right">{fmtNum(m.metrics[k].pr_auc, lang, 3)}</td><td className="text-right">{fmtNum(m.metrics[k].brier, lang, 4)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-ink-2">{p.noMetricsNote}</p>}
          {m && <ul className="mt-2 space-y-0.5 text-xs text-ink-3">{Object.entries(m.beats_baselines_pr_auc).map(([k, v]) => <li key={k}>{p.baselines[k] ?? k}: {v ? p.beats : p.notBeats}</li>)}</ul>}
          <p className="mt-2 text-xs text-ink-3">{p.metricHelp.roc_auc} · {p.metricHelp.pr_auc} · {p.metricHelp.brier}</p>
          <LearnBox learn={d?.learn} />
        </Panel>

        {!reg?.live && <InsightCard region={f.region} />}
      </State>
    </div>
  );
}

export default function Page() {
  const { live, series, filters } = useApp();
  if (!filters.region) return <PickRegion what="Risk forecast" need="cells" />;
  void live; void NeedsHistory;
  return <Inner />;
}
