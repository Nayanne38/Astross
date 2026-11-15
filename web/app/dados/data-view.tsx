"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import { Panel, Pill } from "@/components/panel";
import { copy, dados as T } from "@/content/copy";
import { csvUrl } from "@/lib/api";
import { brDate, int } from "@/lib/format";
import { granularity } from "@/lib/filters";
import { cn } from "@/lib/utils";
import type { ForecastResponse, HexGridResponse } from "@/lib/types";

const t = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const S = copy.sidebar;

type Job = { kind: "history" | "calendar" | "forecast"; state: "busy" | "done" | "error"; msg?: string };

/** Fetch the CSV (so we can show progress and the row count), then save it as a blob. */
async function downloadCsv(url: string): Promise<{ name: string; rows: number }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "dados.csv";
  const header = r.headers.get("x-row-count");
  const rows = header !== null ? Number(header) : Math.max(0, (await blob.text()).split("\n").filter(Boolean).length - 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { name, rows };
}

export function DataView() {
  const { region, range, area, committed, meta } = useAppState();
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (job?.state !== "done" && job?.state !== "error") return;
    const id = setTimeout(() => setJob(null), 8000);
    return () => clearTimeout(id);
  }, [job]);

  const start = range.start ?? region?.data_start ?? undefined;
  const end = range.end ?? region?.data_end ?? undefined;
  const gran = granularity(start, meta?.daily_window_start);
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1 : 0;
  const months = start && end ? (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1 : 0;
  const base = { region: region?.key, start, end, ...area };

  const hex = useApi<HexGridResponse>(region && start ? "/hexgrid" : null, { ...base, boundary: false, limit: 1, learn: false });
  const fc = useApi<ForecastResponse>(region ? "/forecast" : null, { region: region?.key, limit: 1, learn: false, fallback: false });
  if (!region) return null;

  const urls = {
    history: csvUrl({ ...base, sensor: committed.sensor === "todos" ? undefined : committed.sensor,
      category: committed.category === "todas" ? undefined : committed.category }),
    calendar: csvUrl({ ...base, kind: "calendar" }),
    forecast: csvUrl({ region: region.key, ...area, kind: "forecast" }),
  };
  async function run(kind: Job["kind"]) {
    setJob({ kind, state: "busy" });
    try {
      const { name, rows } = await downloadCsv(urls[kind]);
      setJob({ kind, state: "done", msg: t(T.done, { f: name, n: int(rows) }) });
    } catch {
      setJob({ kind, state: "error", msg: T.failed });
    }
  }

  const summary: [string, string][] = [
    [T.labels.region, region.name],
    [T.labels.area, committed.area ? T.customArea : T.wholeRegion],
    [T.labels.period, `${S.periods[committed.period]} · ${brDate(start)} a ${brDate(end)}`],
    [T.labels.sensor, S.sensors[committed.sensor]],
    [T.labels.category, S.categories[committed.category]],
    [T.labels.frp, committed.frp.length ? committed.frp.map((f) => S.frpClasses[f]).join(", ") : T.frpAll],
  ];
  const busy = job?.state === "busy";

  function dlButton(kind: Job["kind"], primary = false) {
    const mine = busy && job?.kind === kind;
    return (
      <button key={kind} type="button" onClick={() => run(kind)} disabled={busy} aria-busy={mine}
        className={cn("inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm disabled:opacity-60", ring,
          primary ? "bg-brand font-semibold text-black hover:opacity-90" : "border border-border hover:bg-accent")}>
        {mine ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
        {mine ? T.downloading : kind === "forecast" ? T.forecastCsv : T.download}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title={T.filtersTitle} subtitle={T.filtersHelp}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {summary.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Pill>{T.granularity[gran]}</Pill>
          <span className="text-muted-foreground">
            {hex.data ? t(T.cellsHint, { n: int(hex.data.n_cells) }) : hex.loading ? copy.states.loading : ""}
            {days ? ` · ${int(days)} dias` : ""}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t(T.dailyFrom, { d: brDate(meta?.daily_window_start) })}</p>
        {committed.frp.length > 0 && <p className="mt-1 text-xs text-fire">{T.labels.frp}: {T.frpNotApplied}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={T.focosTitle}>
          <p className="text-sm text-muted-foreground">{T.focosDesc}</p>
          {gran === "Mensal" && days > 366 && <p className="mt-3 rounded-md border border-fire/40 bg-fire/10 p-2 text-xs">{T.heavy}</p>}
          <div className="mt-4">{dlButton("history", true)}</div>
        </Panel>
        <Panel title={T.calTitle}>
          <p className="text-sm text-muted-foreground">{T.calDesc}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(T.monthsHint, { n: int(months) })}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {dlButton("calendar", true)}
            {fc.data?.available ? dlButton("forecast") : <span className="text-xs text-muted-foreground">{T.forecastNA}</span>}
          </div>
        </Panel>
      </div>
      <p className="text-xs text-muted-foreground">{T.legal}</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={T.dictTitle} subtitle={T.dictSub}><Dict rows={T.columns} caption={T.focosTitle} /></Panel>
        <Panel title={`${T.dictTitle}: ${T.calTitle.toLowerCase()}`}><Dict rows={T.calColumns} caption={T.calTitle} /></Panel>
      </div>

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-12 z-[1000] flex justify-center">
        {job && job.state !== "busy" && (
          <p className={cn("pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg",
            job.state === "done" ? "border-brand/50 bg-panel" : "border-fire/60 bg-panel text-fire")}>{job.msg}</p>
        )}
      </div>
    </div>
  );
}

function Dict({ rows, caption }: { rows: [string, string][]; caption: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map(([c, d]) => (
          <tr key={c} className="border-t border-border align-top">
            <th scope="row" className="py-2 pr-3 text-left font-mono text-xs text-brand">{c}</th>
            <td className="py-2 text-muted-foreground">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
