"use client";
import { useApp } from "./app-state";

/** Shown by the history pages until a region is chosen: nothing is preselected. */
export function PickRegion({ need = "series", what }: { need?: "series" | "cells"; what: string }) {
  const { meta, filters, setFilters } = useApp();
  const opts = (meta?.regions ?? []).filter((r) => !r.key.startsWith("sample") && true);
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-panel p-6">
      <p className="kicker">{what}</p>
      <h1 className="font-display text-2xl font-bold">Choose a region to begin</h1>
      <p className="text-ink-2">
        Nothing is preselected. {need === "cells"
          ? "Every region has a forecast: the trained model where per-cell history exists, otherwise a baseline from the last 5 days of detections."
          : "Every monitored region is listed. Regions marked “series processing” are still being computed from 2003 onwards and will open as soon as they finish."}
      </p>
      <select className="input" value={filters.region} onChange={(e) => setFilters({ region: e.target.value, bbox: null })} aria-label="Region">
        <option value="">Select a region…</option>
        {opts.map((r) => <option key={r.key} value={r.key}>{(r.name_en || r.name) + (r.data_start || need === "cells" ? "" : ` — series processing${r.progress ? " " + Math.round(r.progress * 100) + "%" : ""}`)}</option>)}
      </select>
    </div>
  );
}
