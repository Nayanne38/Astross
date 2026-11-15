"use client";

import { useApi, useAppState } from "@/components/app-state";
import { Panel, Pill, StatCard } from "@/components/panel";
import { brDate, int, num, signedPct } from "@/lib/format";
import type { ForecastResponse, Summary } from "@/lib/types";

const CLASS_LABEL = { baixo: "Baixo", moderado: "Moderado", alto: "Alto", muito_alto: "Muito alto" } as const;

export function HomeView() {
  const { region, range } = useAppState();
  const sum = useApi<Summary>(region ? "/summary" : null, { region: region?.key, start: range.start, end: range.end, learn: false });
  const fc = useApi<ForecastResponse>(region ? "/forecast" : null, { region: region?.key, limit: 1, learn: false });
  const cmp = sum.data?.comparison;
  const fb = fc.data?.fallback;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Detecções de calor no período" value={sum.data ? int(sum.data.total_hotspots) : "…"}
          note={sum.data ? `${brDate(sum.data.start)} a ${brDate(sum.data.end)} · todos os satélites, após filtros de qualidade` : undefined} />
        <StatCard label="Comparado à média histórica" value={cmp?.deviation_pct != null ? signedPct(cmp.deviation_pct) : "…"}
          badge={cmp && <Pill>{cmp.label}</Pill>}
          note={cmp && `mês atual${cmp.same_days_only ? ` (dias 1 a ${cmp.days_compared})` : ""} vs. ${cmp.n_ref} anos anteriores${cmp.percentile != null ? ` · percentil ${num(cmp.percentile, 0)}` : ""}`} />
        <StatCard label={fc.data?.available ? `Risco nos próximos ${fc.data.horizon_days} dias` : "Climatologia do próximo mês"}
          value={fb ? CLASS_LABEL[fb.region_class] : fc.data ? "—" : "…"}
          badge={fb && <Pill className="bg-fire/15 text-fire">não é previsão</Pill>}
          note={fb && `${num(fb.region_mean * 100, 0)}% dos anos ${fb.ref_year_min}–${fb.ref_year_max} com detecção, em média por hexágono (limiares a validar)`} />
      </div>
      <Panel title="Mapa de focos" subtitle="Próxima etapa (F2): densidade em hexágonos, focos com filtro de intensidade e camada de climatologia.">
        <p className="py-16 text-center text-sm text-muted-foreground">O mapa entra no F2. Use o <a className="text-brand underline" href="/calendario">Calendário</a> para ver o F1.</p>
      </Panel>
    </div>
  );
}
