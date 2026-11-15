"use client";

import { useMemo, useState } from "react";
import { useApi, useAppState } from "@/components/app-state";
import { AnomalyLegend, CalendarHeatmap, CountLegend, useCountScale, type CalMode } from "@/components/calendar-heatmap";
import { ErrorBox, Loading, Panel, Pill, StatCard, Toggle } from "@/components/panel";
import { MESES, cap, int, num, signedPct } from "@/lib/format";
import type { CalendarResponse, Summary } from "@/lib/types";

const CAT_TONE: Record<string, string> = {
  muito_abaixo: "#6b9fd6", abaixo: "#a9c6e8", normal: "#3fd0b5", acima: "#f6c49a", muito_acima: "#ff7a2f", indisponivel: "#93a7b1",
};

function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v))).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function CalendarView() {
  const { region, range, palette, classes, invert, meta } = useAppState();
  const [mode, setMode] = useState<CalMode>("contagem");
  const [asTable, setAsTable] = useState(false);
  const params = { region: region?.key, start: range.start, end: range.end, top_n: 5 };
  const cal = useApi<CalendarResponse>(region ? "/calendar" : null, params);
  const sum = useApi<Summary>(region ? "/summary" : null, { region: region?.key, start: range.start, end: range.end });
  const cells = useMemo(() => cal.data?.cells ?? [], [cal.data]);
  const scale = useCountScale(cells, palette, classes, invert);

  const critical = useMemo(() => {
    const full = cells.filter((c) => !c.is_partial);
    if (!full.length) return null;
    const by = Array.from({ length: 12 }, (_, i) => {
      const v = full.filter((c) => c.month === i + 1).map((c) => c.value);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1;
    });
    const m = by.indexOf(Math.max(...by));
    return { month: m + 1, mean: by[m] };
  }, [cells]);

  if (!region) return meta === null ? <Loading what="regiões" /> : null;
  const cmp = sum.data?.comparison;
  const learn = cal.data?.learn;
  const years = cells.length ? `${cells[0].year} a ${cells[cells.length - 1].year}` : "";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Mês com mais detecções (média)" value={critical ? cap(MESES[critical.month - 1]) : "—"}
          note={critical ? `${int(critical.mean)} células-dia com detecção, em média, nos meses completos do período` : undefined} />
        <StatCard label="Mês atual vs. anos anteriores"
          value={cmp ? (cmp.deviation_pct != null ? signedPct(cmp.deviation_pct) : "—") : "…"}
          tone={cmp ? CAT_TONE[cmp.category] : undefined}
          badge={cmp && <Pill>{cmp.label}{cmp.percentile != null ? ` · ${num(cmp.percentile, 0)}º percentil` : ""}</Pill>}
          note={cmp && (cmp.same_days_only
            ? `${cap(MESES[cmp.month - 1])} de ${cmp.year}, dias 1 a ${cmp.days_compared}, comparado aos mesmos dias de ${cmp.n_ref} anos (${cmp.ref_year_min}–${cmp.ref_year_max})${cmp.is_provisional ? " · dados provisórios" : ""}`
            : `${cap(MESES[cmp.month - 1])} de ${cmp.year}, média por dia vs. ${cmp.n_ref} anos anteriores`)} />
        <StatCard label="Média mensal no período" value={sum.data ? int(sum.data.monthly_mean) : "…"}
          note="células-dia com detecção por mês completo (escala VIIRS)" />
      </div>

      {learn?.avisos.length ? (
        <div className="flex flex-wrap gap-2">
          {learn.avisos.map((a) => <p key={a.codigo} className="rounded-md border border-fire/40 bg-fire/10 px-2.5 py-1.5 text-xs">{a.texto}</p>)}
        </div>
      ) : null}

      <Panel title="Detecções por mês" pngName={`calendario_${region.key}`}
        subtitle={`${region.name}${years ? `, ${years}` : ""} · MODIS e VIIRS harmonizados (escala VIIRS)`}
        actions={<Toggle label="Modo do calendário" value={mode} onChange={setMode}
          options={[{ id: "contagem", label: "Contagem" }, { id: "anomalia", label: "Anomalia" }]} />}>
        {cal.error && <ErrorBox error={cal.error} />}
        {cal.loading && !cells.length && <Loading what="calendário" />}
        {cells.length > 0 && (asTable ? <CalendarTable cells={cells} /> : (
          <CalendarHeatmap cells={cells} mode={mode} palette={palette} classes={classes} invert={invert}
            provisionalFrom={learn?.procedencia.provisional_from} />
        ))}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {mode === "contagem" ? <CountLegend breaks={scale.breaks} colors={scale.colors} /> : <AnomalyLegend />}
          <div className="ml-auto flex gap-2" data-html2png-ignore>
            <button className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent" onClick={() => setAsTable(!asTable)}>
              {asTable ? "Ver como calendário" : "Ver como tabela"}
            </button>
            <button className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90" disabled={!cells.length}
              onClick={() => downloadCsv(`calendario_${region.key}${range.start ? `_${range.start}_${range.end}` : ""}.csv`, [
                ["# Fonte: NASA FIRMS (MODIS/VIIRS), série harmonizada Calendário de Queimadas. Unidade: células-dia com detecção de foco de calor."],
                ["ano", "mes", "celulas_dia", "media_por_dia", "dias_observados", "mes_incompleto", "percentil", "desvio_pct_anos_anteriores", "modis_celulas_dia", "viirs_celulas_dia", "deteccoes"],
                ...cells.map((c) => [c.year, c.month, c.value, c.daily_mean, c.obs_days, c.is_partial ? 1 : 0, c.percentile, c.deviation_pct, c.modis_cell_days, c.viirs_cell_days, c.hotspot_count]),
              ])}>Baixar CSV</button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Hachurado = mês incompleto · contorno tracejado = dados provisórios · contorno verde = um dos 5 meses com mais detecções.
          Cada célula-dia é um hexágono de ~36 km² com ao menos uma detecção de calor; não é área queimada.
        </p>
      </Panel>

      {cmp && <p className="text-sm text-muted-foreground">{cmp.sentence}</p>}
    </div>
  );
}

function CalendarTable({ cells }: { cells: CalendarResponse["cells"] }) {
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">Detecções por mês (tabela equivalente ao calendário)</caption>
        <thead className="sticky top-0 bg-panel text-left text-muted-foreground">
          <tr>{["Mês", "Células-dia", "Por dia", "Dias obs.", "Percentil", "Desvio vs. anos anteriores"].map((h) => <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {[...cells].reverse().map((c) => (
            <tr key={`${c.year}-${c.month}`} className="border-t border-border">
              <th scope="row" className="px-2 py-1 text-left font-normal">{cap(MESES[c.month - 1])} de {c.year}{c.is_partial ? " (incompleto)" : ""}</th>
              <td className="px-2 py-1 tabular-nums">{int(c.value)}</td>
              <td className="px-2 py-1 tabular-nums">{num(c.daily_mean)}</td>
              <td className="px-2 py-1 tabular-nums">{c.obs_days}</td>
              <td className="px-2 py-1 tabular-nums">{c.percentile != null ? num(c.percentile, 0) : "—"}</td>
              <td className="px-2 py-1 tabular-nums">{signedPct(c.deviation_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
