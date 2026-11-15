"use client";
import Link from "next/link";
import { useApp } from "./app-state";

/** Shown instead of history-based pages when a live (near-real-time) region is selected. */
export function NeedsHistory({ need = "series" }: { need?: "series" | "cells" }) {
  const { lang, meta, setFilters, filters } = useApp();
  const full = (meta?.regions ?? []).filter((r) => (need === "cells" ? !r.live : true) && r.data_start && !r.key.startsWith("sample") && r.key !== filters.region);
  const reg = meta?.regions.find((r) => r.key === filters.region);
  const T = lang === "pt"
    ? { h: "Esta região é monitorada ao vivo", p: need === "cells" ? "A previsão de risco precisa do histórico célula a célula, que existe só para:" : "A série histórica desta região (2003 em diante) ainda está sendo processada. Enquanto isso, o mapa mostra as detecções das últimas horas e dias. Já disponível para:", go: "Ver", map: "Voltar ao mapa" }
    : { h: "This region is monitored live", p: need === "cells" ? "The risk forecast needs per-cell history, which exists only for:" : "The historical series for this region (2003 onwards) is still being processed. Meanwhile the map shows detections from the last hours and days. Already available for:", go: "Open", map: "Back to the map" };
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-line bg-panel p-6">
      <p className="kicker">{reg ? (lang === "pt" ? reg.name : reg.name_en || reg.name) : ""}</p>
      <h1 className="font-display text-2xl font-bold">{T.h}</h1>
      <p className="text-ink-2">{T.p}</p>
      <div className="flex flex-wrap gap-2">
        {full.map((r) => <button key={r.key} className="btn" onClick={() => setFilters({ region: r.key, bbox: null, layer: "densidade" })}>{T.go}: {lang === "pt" ? r.name : r.name_en || r.name}</button>)}
        <Link href="/" className="btn-ghost">{T.map}</Link>
      </div>
    </div>
  );
}
