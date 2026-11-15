"use client";
import { NeedsHistory } from "@/components/needs-history";
import { PickRegion } from "@/components/pick-region";
import { useState } from "react";
import { useApp } from "@/components/app-state";
import { Panel } from "@/components/panel";
import { csvUrl } from "@/lib/api";
import { granularity } from "@/lib/filters";
import { fmtDate, fmtInt, tpl } from "@/lib/format";

function Inner() {
  const { t, lang, filters: f, setFilters, range, meta, live } = useApp();
  const d = t.dados;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [start, end] = range ?? ["", ""];
  const gran = range ? granularity(start, meta?.daily_window_start ?? null) : "Mensal";

  async function get(kind: "history" | "calendar", file: string) {
    setBusy(kind); setMsg("");
    try {
      const params: Record<string, string> = { kind, region: f.region, start, end };
      if (f.sensor !== "todos") params.sensor = f.sensor;
      if (f.category !== "todas") params.category = f.category;
      if (f.bbox) params.bbox = f.bbox.join(",");
      const r = await fetch(csvUrl(params));
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const n = r.headers.get("X-Row-Count");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = file; a.click();
      URL.revokeObjectURL(a.href);
      setMsg(tpl(d.done, { f: file, n: n ? fmtInt(+n, lang) : "?" }));
    } catch { setMsg(d.failed); } finally { setBusy(null); }
  }

  const rows: [string, string][] = [
    [d.labels.region, meta?.regions.find((r) => r.key === f.region)?.name ?? f.region],
    [d.labels.area, f.bbox ? d.customArea : d.wholeRegion],
    [d.labels.period, `${fmtDate(start, lang)} – ${fmtDate(end, lang)} · ${d.granularity[gran]}`],
    [d.labels.sensor, t.copy.sidebar.sensors[f.sensor]],
    [d.labels.category, t.copy.sidebar.categories[f.category]],
    [d.labels.frp, f.frp.length ? f.frp.map((x) => t.copy.sidebar.frpClasses[x]).join(", ") : d.frpAll],
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{d.title}</h1>
      <p className="text-ink-2">{d.subtitle}</p>
      <Panel title={d.filtersTitle} sub={d.filtersHelp} png={false}>
        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1">Period
            <select className="input" value={f.period} onChange={(e) => setFilters({ period: e.target.value as typeof f.period })}>
              {(["serie", "5a", "12m", "30d", "1d"] as const).map((k) => <option key={k} value={k}>{t.copy.sidebar.periods[k]}</option>)}
            </select></label>
          <label className="grid gap-1">Sensor
            <select className="input" value={f.sensor} onChange={(e) => setFilters({ sensor: e.target.value as typeof f.sensor })}>
              {(["todos", "modis", "viirs"] as const).map((k) => <option key={k} value={k}>{t.copy.sidebar.sensors[k]}</option>)}
            </select></label>
          <label className="grid gap-1">Category
            <select className="input" value={f.category} onChange={(e) => setFilters({ category: e.target.value as typeof f.category })}>
              {(["todas", "modis", "viirs", "coincidentes"] as const).map((k) => <option key={k} value={k}>{t.copy.sidebar.categories[k]}</option>)}
            </select></label>
          <div className="grid gap-1">Intensity (FRP)
            <div className="flex flex-wrap gap-1.5">
              {(["baixa", "media", "alta", "muito_alta"] as const).map((k) => {
                const on = f.frp.includes(k);
                return <button key={k} aria-pressed={on} onClick={() => setFilters({ frp: on ? f.frp.filter((x) => x !== k) : [...f.frp, k] })}
                  className={on ? "press rounded-full border border-brand bg-brand/15 px-2.5 py-1 text-xs" : "press rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs"}>{t.copy.sidebar.frpClasses[k]}</button>;
              })}
            </div></div>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-ink-3">{k}:</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs text-ink-3">FRP {d.frpNotApplied}</p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={d.focosTitle} png={false}>
          <p className="mb-3 text-sm text-ink-2">{d.focosDesc}</p>
          <button className="btn" disabled={!range || !!busy || live} onClick={() => get("history", `firetrack-focos-${f.region}.csv`)}>{busy === "history" ? d.downloading : d.download}</button>
          <p className="mt-2 text-xs text-ink-3">{live ? "Unavailable in this region: only the regional series exists (use the calendar CSV)." : d.heavy}</p>
        </Panel>
        <Panel title={d.calTitle} png={false}>
          <p className="mb-3 text-sm text-ink-2">{d.calDesc}</p>
          <button className="btn" disabled={!range || !!busy} onClick={() => get("calendar", `firetrack-calendario-${f.region}.csv`)}>{busy === "calendar" ? d.downloading : d.download}</button>
        </Panel>
      </div>
      <p aria-live="polite" className="text-sm text-brand">{msg}</p>
      <p className="text-xs text-ink-3">{d.legal}</p>
      <Panel title={d.dictTitle} sub={d.dictSub} png={false}>
        <dl className="space-y-1.5 text-sm">
          {[...d.columns, ...d.calColumns].map(([k, v]) => <div key={k}><dt className="inline font-mono text-brand">{k}</dt> <dd className="inline text-ink-2">— {v}</dd></div>)}
        </dl>
      </Panel>
    </div>
  );
}

export default function Page() {
  const { live, series, filters } = useApp();
  if (!filters.region) return <PickRegion what="Full data" need="series" />;
  return live && !series ? <NeedsHistory /> : <Inner />;
}
