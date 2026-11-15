"use client";

import { useState } from "react";
import { type ForecastInsight, api, fmtDate, fmtPct } from "@/lib/fire-data";

const CONF = { baixa: "text-bad", media: "text-fire-2", alta: "text-ok" } as const;

// Claude's reading of the model forecast. Generated on demand (it costs an API call) and cached
// server-side per forecast date + audience.
export default function InsightCard({ region, audience = "geral" }: { region?: string; audience?: "geral" | "professor" }) {
  const [data, setData] = useState<ForecastInsight | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true); setErr(null);
    try { setData(await api<ForecastInsight>("/forecast/insight", { region, audience })); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  if (!data) return (
    <div className="card flex flex-col gap-3">
      <p className="kicker">AI analysis · Claude</p>
      <h3 className="h2">{audience === "professor" ? "Forecast explained for the classroom" : "What is the forecast saying?"}</h3>
      <p className="text-sm text-muted">
        Claude reads the probabilities computed by the statistical model, the evaluation metrics and the region's history, and writes an
        interpretation in English. The AI does not invent numbers: it only interprets the ones the model produced.
      </p>
      <div><button className="btn" onClick={run} disabled={loading}>{loading ? "Generating analysis…" : "✨ Generate analysis"}</button></div>
      {loading && <p className="text-xs text-muted">It may take a few seconds the first time. After that the response is cached.</p>}
      {err && <p className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{err}</p>}
    </div>
  );

  const i = data.insight;
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="kicker">AI analysis · {data.model}</p>
        <span className="chip">from {fmtDate(data.forecast_date)} · next {data.horizon_days} days</span>
      </div>
      <h3 className="h2">{i.titulo}</h3>
      <p className="leading-relaxed">{i.resumo}</p>
      <p className="text-sm">Confidence: <b className={CONF[i.confianca]}>{i.confianca === "baixa" ? "low" : i.confianca === "media" ? "medium" : "high"}</b> <span className="text-muted">— {i.justificativa_confianca}</span></p>

      {i.areas_prioritarias.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Priority areas</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {i.areas_prioritarias.map((a, k) => (
              <li key={k} className="rounded-lg border border-line bg-panel-2 p-3 text-sm">
                <div className="flex justify-between gap-2"><b>{a.nome}</b><span className="text-fire">{fmtPct(a.probabilidade)}</span></div>
                <p className="mt-1 text-muted">{a.motivo}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <List title="Factors" items={i.fatores} />
        <List title={audience === "professor" ? "Ideas for class" : "Recommendations"} items={i.recomendacoes} />
        <List title="Limitations" items={i.limitacoes} />
      </div>
      <p className="border-t border-line pt-3 text-xs text-muted">{data.disclaimer}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      <ul className="list-disc space-y-1 pl-4 text-sm text-fg/85">{items.map((x, k) => <li key={k}>{x}</li>)}</ul>
    </div>
  );
}
