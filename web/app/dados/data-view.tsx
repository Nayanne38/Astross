"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import { Panel, Pill } from "@/components/panel";
import { csvUrl } from "@/lib/api";
import { addDays, brDate, int } from "@/lib/format";
import type { ForecastResponse, HexGridResponse } from "@/lib/types";

const COLUMNS: [string, string][] = [
  ["date", "Dia (dados diários) ou 1º dia do mês (dados mensais), AAAA-MM-DD"],
  ["region", "Chave da região (config/regions.yaml)"],
  ["cell_id", "Hexágono H3 resolução 6 (~36 km²)"],
  ["lat, lon", "Centro do hexágono (graus WGS84), não a posição do fogo"],
  ["harmonized_count", "Células-dia com detecção na escala VIIRS (série harmonizada). Antes de 2012 é estimativa a partir do MODIS"],
  ["modis_count, viirs_count", "Detecções de cada sensor no hexágono, após filtros de qualidade (VIIRS soma os satélites)"],
  ["source_mix", "Quem detectou: MODIS, VIIRS ou BOTH (ambos), pelas contagens brutas. harmonized_count usa só o satélite VIIRS de referência, por isso pode ser 0 numa linha VIIRS"],
  ["percentile, anomaly_zscore", "Posição do mês da região em relação ao mesmo mês nos outros anos (repetido em cada linha do mês)"],
  ["modis_only", "1 = só o MODIS detectou neste hexágono e período (nenhuma detecção VIIRS); 0 = caso contrário. Útil para ver o que só o sensor antigo registrou"],
];

const field = "rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm";

export function DataView() {
  const { region, range, meta } = useAppState();
  const dataEnd = region?.data_end ?? undefined;
  const dailyStart = meta?.daily_window_start ?? undefined;
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [bbox, setBbox] = useState("");
  const s = start ?? range.start ?? (dataEnd ? addDays(dataEnd, -29) : "");
  const e = end ?? range.end ?? dataEnd ?? "";
  const days = s && e ? Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1 : 0;
  const daily = !!(dailyStart && s >= dailyStart);
  const bboxOk = bbox.trim() === "" || /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(bbox.replace(/\s/g, ""));

  // Row-count hint: number of cells with detections in the period (from /hexgrid, no geometry).
  const hex = useApi<HexGridResponse>(region && s && e && bboxOk ? "/hexgrid" : null,
    { region: region?.key, start: s, end: e, boundary: false, limit: 1, learn: false, bbox: bbox.replace(/\s/g, "") || undefined });
  const fc = useApi<ForecastResponse>(region ? "/forecast" : null, { region: region?.key, limit: 1, learn: false, fallback: false });
  const heavy = !daily && days > 366;
  const url = useMemo(() => region ? csvUrl({ region: region.key, start: s, end: e, bbox: bbox.replace(/\s/g, "") || undefined }) : "#",
    [region, s, e, bbox]);

  if (!region) return null;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Panel title="Exportar CSV por hexágono" subtitle={`${region.name} · fonte: NASA FIRMS (MODIS + VIIRS), série harmonizada`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">De
            <input type="date" className={`${field} block w-full`} value={s} min={region.data_start ?? undefined} max={e || undefined} onChange={(x) => setStart(x.target.value)} />
          </label>
          <label className="space-y-1 text-sm">Até
            <input type="date" className={`${field} block w-full`} value={e} min={s || undefined} max={dataEnd} onChange={(x) => setEnd(x.target.value)} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">Recorte opcional (oeste, sul, leste, norte em graus)
            <input className={`${field} block w-full`} placeholder="ex.: -48.5,-10.5,-47.5,-9.5" value={bbox} onChange={(x) => setBbox(x.target.value)} aria-invalid={!bboxOk} />
            {!bboxOk && <span className="text-xs text-fire">Use quatro números separados por vírgula.</span>}
          </label>
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          <li>Granularidade: <Pill>{daily ? "diária (uma linha por dia e hexágono)" : "mensal (uma linha por mês e hexágono)"}</Pill></li>
          <li className="text-muted-foreground">
            {daily ? `Dados diários existem a partir de ${brDate(dailyStart)}; antes disso o arquivo usa totais mensais.`
              : `Para dados diários, comece em ${brDate(dailyStart)} ou depois.`}
          </li>
          <li className="text-muted-foreground">
            {hex.data ? `${int(hex.data.n_cells)} hexágonos com detecção no período` : hex.loading ? "Calculando tamanho…" : ""}
            {hex.data && days ? ` · ${int(days)} dias` : ""}
          </li>
          {heavy && <li className="rounded-md border border-fire/40 bg-fire/10 p-2 text-xs">Período longo em dados mensais por hexágono pode gerar um arquivo grande (centenas de milhares de linhas). Para a série regional mês a mês, use “Baixar CSV” no Calendário.</li>}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={bboxOk ? url : undefined} aria-disabled={!bboxOk}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-40">
            <Download className="size-4" /> Baixar CSV
          </a>
          {fc.data?.available
            ? <a href={csvUrl({ region: region.key, kind: "forecast" })} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"><Download className="size-4" /> CSV da previsão</a>
            : <span className="self-center text-xs text-muted-foreground">CSV de previsão: indisponível até existir um modelo avaliado.</span>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A primeira linha do arquivo traz a atribuição obrigatória à NASA FIRMS. Dados derivados sob CC BY 4.0.
          Os dias a partir de 1º/08/2026 vêm de produtos em tempo quase real e são provisórios.
        </p>
      </Panel>

      <Panel title="Dicionário de colunas" subtitle="Unidade principal: células-dia com detecção de foco de calor (não é área queimada)">
        <table className="w-full text-sm">
          <caption className="sr-only">Colunas do arquivo CSV</caption>
          <tbody>
            {COLUMNS.map(([c, d]) => (
              <tr key={c} className="border-t border-border align-top">
                <th scope="row" className="whitespace-nowrap py-2 pr-3 text-left font-mono text-xs text-brand">{c}</th>
                <td className="py-2 text-muted-foreground">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
