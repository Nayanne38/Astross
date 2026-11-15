"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { cellToParent, latLngToCell } from "h3-js";
import { useApi, useAppState, type MapMode } from "@/components/app-state";
import { ErrorBox, Panel, Pill, StatCard, Toggle } from "@/components/panel";
import type { MapHex, MapPoint } from "@/components/hex-map";
import { brDate, int, num, signedPct } from "@/lib/format";
import { classColors, classOf, quantileBreaks } from "@/lib/palettes";
import type { Detection, ForecastResponse, HexGridResponse, RecentResponse, Summary } from "@/lib/types";

const HexMap = dynamic(() => import("@/components/hex-map"), {
  ssr: false,
  loading: () => <div className="grid h-[520px] place-items-center text-sm text-muted-foreground">Carregando mapa…</div>,
});

const CLASS_LABEL: Record<string, string> = { baixo: "Baixo", moderado: "Moderado", alto: "Alto", muito_alto: "Muito alto" };
type SensorCat = "todos" | "modis" | "viirs" | "ambos";
const CAPS = [1000, 3000, 6000, 10000];
const FRP_CLASSES = ["Baixa", "Média", "Alta", "Muito alta"];
// Display resolution by zoom: res-6 cells (~36 km²) are 1–2 px wide when the whole region is visible.
const AREA_KM2: Record<number, string> = { 4: "1.770", 5: "253", 6: "36" };
function displayRes(zoom: number) { return zoom < 6.5 ? 4 : zoom < 8 ? 5 : 6; }

/** Per-sensor FRP quartiles: MODIS (1 km) and VIIRS (375 m) FRP are not on the same scale. */
function frpQuartiles(det: Detection[]) {
  const out: Record<string, number[]> = {};
  for (const fam of ["MODIS", "VIIRS"]) {
    const v = det.filter((d) => d.sensor_family === fam && d.frp != null).map((d) => d.frp as number).sort((a, b) => a - b);
    out[fam] = v.length ? [0.25, 0.5, 0.75].map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]) : [];
  }
  return out;
}

export function HomeView() {
  const s = useAppState();
  const { region, range, palette, classes, invert, mapMode, setMapMode } = s;
  const [sensor, setSensor] = useState<SensorCat>("todos");
  const [cap, setCap] = useState(3000);
  const [frpOn, setFrpOn] = useState([true, true, true, true]);
  const [zoom, setZoom] = useState(5);
  const res = displayRes(zoom);

  // deep link: /#focos, /#climatologia, /#densidade
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    const m = ({ focos: "focos", climatologia: "risco", densidade: "densidade" } as Record<string, MapMode>)[h];
    if (m) setMapMode(m);
  }, [setMapMode]);

  const start = range.start ?? region?.data_start ?? undefined;
  const end = range.end ?? region?.data_end ?? undefined;
  const days = start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1 : 9999;
  const pointDays = Math.min(days, 60);

  const sum = useApi<Summary>(region ? "/summary" : null, { region: region?.key, start, end, learn: false });
  const hex = useApi<HexGridResponse>(region && mapMode === "densidade" ? "/hexgrid" : null,
    { region: region?.key, start, end, boundary: false, limit: 100000, learn: false });
  const rec = useApi<RecentResponse>(region && mapMode === "focos" ? "/recent" : null,
    { region: region?.key, days: pointDays, limit: 30000, learn: false });
  const fc = useApi<ForecastResponse>(region ? "/forecast" : null,
    { region: region?.key, limit: mapMode === "risco" ? 60000 : 1, learn: false, boundary: false });

  // ---------------- density layer
  const density = useMemo(() => {
    const cells = (hex.data?.cells ?? []).filter((c) =>
      sensor === "todos" ? true : sensor === "modis" ? c.modis_count > 0 && c.viirs_count === 0
        : sensor === "viirs" ? c.viirs_count > 0 && c.modis_count === 0 : c.modis_count > 0 && c.viirs_count > 0);
    const agg = new Map<string, { value: number; modis: number; viirs: number; n: number }>();
    for (const c of cells) {
      const k = res === 6 ? c.cell_id : cellToParent(c.cell_id, res);
      const a = agg.get(k) ?? { value: 0, modis: 0, viirs: 0, n: 0 };
      a.value += c.value; a.modis += c.modis_count; a.viirs += c.viirs_count; a.n += 1;
      agg.set(k, a);
    }
    const all = [...agg.entries()].sort((x, y) => y[1].value - x[1].value);
    const drawn = all.slice(0, cap);
    const breaks = quantileBreaks(drawn.map(([, a]) => a.value), classes);
    const colors = classColors(palette, classes, invert);
    const gran = hex.data?.granularity;
    const hexes: MapHex[] = drawn.map(([id, a]) => ({
      id, color: colors[classOf(a.value, breaks)],
      tooltip: `<b>${num(a.value, gran === "day" ? 0 : 1)} células-dia com detecção</b>${res < 6 ? `<br/>soma de ${a.n} hexágonos de ~36 km² neste hexágono de ~${AREA_KM2[res]} km²` : ""}<br/>MODIS: ${int(a.modis)} · VIIRS: ${int(a.viirs)} detecções${gran === "month" ? "<br/>totais mensais" : ""}`,
    }));
    return { hexes, breaks, colors, matched: all.length, drawn: drawn.length, sourceCells: cells.length };
  }, [hex.data, sensor, cap, classes, palette, invert, res]);

  // ---------------- points layer
  const pointsLayer = useMemo(() => {
    const det = rec.data?.detections ?? [];
    const q = frpQuartiles(det);
    const colors = classColors(palette, 4, invert);
    let pts = det;
    if (sensor !== "todos") {
      if (sensor === "ambos") {
        const fams = new Map<string, Set<string>>();
        const cellOf = det.map((d) => latLngToCell(d.lat, d.lon, 6));
        det.forEach((d, i) => { const k = cellOf[i]; if (!fams.has(k)) fams.set(k, new Set()); fams.get(k)!.add(d.sensor_family); });
        pts = det.filter((_, i) => fams.get(cellOf[i])!.size === 2);
      } else pts = det.filter((d) => d.sensor_family === (sensor === "modis" ? "MODIS" : "VIIRS"));
    }
    const classed = pts.map((d) => ({ d, k: d.frp == null || !q[d.sensor_family].length ? -1 : classOf(d.frp, q[d.sensor_family]) }));
    const shown = classed.filter((x) => x.k === -1 ? frpOn.every(Boolean) : frpOn[x.k]).slice(0, cap);
    const points: MapPoint[] = shown.map(({ d, k }) => ({
      lat: d.lat, lon: d.lon, color: k === -1 ? "#93a7b1" : colors[k], stroke: d.sensor_family === "MODIS" ? "#ffffff" : "#0e1418",
      tooltip: `<b>${d.satellite}</b> (${d.sensor_family}) · ${brDate(d.date)} ${String(d.time_utc).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2")} UTC<br/>Potência radiativa: ${d.frp != null ? num(d.frp) + " MW" : "—"} (${k >= 0 ? FRP_CLASSES[k].toLowerCase() : "sem FRP"} para o ${d.sensor_family})<br/>Confiança: ${d.confidence_class}`,
    }));
    return { points, q, colors, matched: classed.length, total: det.length };
  }, [rec.data, sensor, frpOn, cap, palette, invert]);

  // ---------------- climatology layer
  const risk = useMemo(() => {
    const fb = fc.data?.fallback;
    const colors = classColors(palette, 4, invert);
    const idx: Record<string, number> = { baixo: 0, moderado: 1, alto: 2, muito_alto: 3 };
    if (mapMode !== "risco" || !fb) return { hexes: [] as MapHex[], colors, total: 0 };
    const cls = (f: number) => (f >= fb.thresholds.muito_alto ? "muito_alto" : f >= fb.thresholds.alto ? "alto" : f >= fb.thresholds.moderado ? "moderado" : "baixo");
    const agg = new Map<string, number>();
    for (const c of fb.cells) {
      const k = res === 6 ? c.cell_id : cellToParent(c.cell_id, res);
      agg.set(k, Math.max(agg.get(k) ?? 0, c.frequency));
    }
    const all = [...agg.entries()].sort((a, b) => b[1] - a[1]);
    const hexes: MapHex[] = all.slice(0, cap).map(([id, f]) => ({
      id, color: colors[idx[cls(f)]],
      tooltip: `<b>${num(f * 100, 0)}% dos anos</b> ${fb.ref_year_min}–${fb.ref_year_max} com detecção VIIRS neste mês${res < 6 ? " (maior valor entre os hexágonos de ~36 km² contidos)" : ""}<br/>Classe: ${CLASS_LABEL[cls(f)]} (limiares a validar)<br/><i>Climatologia, não previsão</i>`,
    }));
    return { hexes, colors, total: all.length };
  }, [fc.data, mapMode, palette, invert, res, cap]);

  if (!region) return null;
  const cmp = sum.data?.comparison;
  const fb = fc.data?.fallback;
  const active = mapMode === "densidade" ? hex : mapMode === "focos" ? rec : fc;

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

      <Panel title="Mapa de focos" pngName={`mapa_${region.key}_${mapMode}`}
        subtitle={mapMode === "focos"
          ? `Detecções individuais dos últimos ${pointDays} dias${days > 60 ? " (máximo disponível para pontos)" : ""}`
          : mapMode === "risco" ? (fb?.label ?? "Climatologia")
          : `${region.name} · ${brDate(start)} a ${brDate(end)}${hex.data ? ` · ${hex.data.granularity === "day" ? "dados diários" : "totais mensais"}` : ""}`}
        actions={<Toggle label="Camada do mapa" value={mapMode} onChange={(m: MapMode) => setMapMode(m)}
          options={[{ id: "densidade", label: "Densidade" }, { id: "focos", label: "Focos" }, { id: "risco", label: "Climatologia" }]} />}>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs" data-html2png-ignore>
          {mapMode !== "risco" && (
            <label className="flex items-center gap-1.5">Sensores
              <select className="rounded border border-input bg-background px-1.5 py-1" value={sensor} onChange={(e) => setSensor(e.target.value as SensorCat)}>
                <option value="todos">Todos</option>
                <option value="modis">Só MODIS</option>
                <option value="viirs">Só VIIRS</option>
                <option value="ambos">Ambos (mesmo hexágono)</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">Desenhar até
            <select className="rounded border border-input bg-background px-1.5 py-1" value={cap} onChange={(e) => setCap(Number(e.target.value))}>
              {CAPS.map((c) => <option key={c} value={c}>{int(c)}</option>)}
            </select>
            {mapMode === "focos" ? "pontos" : "hexágonos"}
          </label>
          {mapMode === "focos" && (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Intensidade (FRP)</legend>
              <span className="text-muted-foreground">Intensidade (FRP, quartis por sensor):</span>
              {FRP_CLASSES.map((c, i) => (
                <label key={c} className="flex items-center gap-1">
                  <input type="checkbox" checked={frpOn[i]} onChange={(e) => setFrpOn(frpOn.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <span className="inline-block size-2.5 rounded-full" style={{ background: pointsLayer.colors[i] }} />{c}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        {active.error && <ErrorBox error={active.error} />}
        <div className="relative">
          {region.bbox && (
            <HexMap bbox={region.bbox} onZoom={setZoom}
              hexes={mapMode === "densidade" ? density.hexes : mapMode === "risco" ? risk.hexes : []}
              points={mapMode === "focos" ? pointsLayer.points : []} />
          )}
          {active.loading && <div className="absolute inset-x-0 top-2 z-[500] mx-auto w-fit rounded-md bg-panel/90 px-3 py-1 text-xs" role="status">Carregando…</div>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {mapMode === "densidade" && hex.data && (
            <>
              <span>menos</span>
              <div className="flex">{density.colors.map((c, i) => <span key={c + i} className="h-3 w-7" style={{ background: c }} />)}</div>
              <span>mais</span>
              <span>· células-dia com detecção (classes por quantil) · hexágonos de ~{AREA_KM2[res]} km²{res < 6 ? " (agregados; aproxime para ver ~36 km²)" : ""} · mostrando {int(density.drawn)} de {int(density.matched)}{density.drawn < density.matched ? " (os de maior valor)" : ""}</span>
            </>
          )}
          {mapMode === "focos" && rec.data && (
            <span>
              {int(pointsLayer.points.length)} de {int(pointsLayer.total)} detecções desenhadas{rec.data.truncated ? " (lista truncada pela API)" : ""} ·
              contorno branco = MODIS, escuro = VIIRS · quartis de FRP: MODIS {pointsLayer.q.MODIS.map((v) => num(v)).join(" / ") || "—"} MW;
              VIIRS {pointsLayer.q.VIIRS.map((v) => num(v)).join(" / ") || "—"} MW
            </span>
          )}
          {mapMode === "risco" && fb && (
            <>
              {["Baixo", "Moderado", "Alto", "Muito alto"].map((l, i) => (
                <span key={l} className="flex items-center gap-1"><span className="h-3 w-5" style={{ background: risk.colors[i] }} />{l}</span>
              ))}
              <span>· limiares {Object.values(fb.thresholds).map((t) => `${num(t * 100, 0)}%`).join(" / ")} (a validar) · hexágonos de ~{AREA_KM2[res]} km²{res < 6 ? " (maior frequência entre os contidos)" : ""} · {int(risk.hexes.length)} de {int(risk.total)}{fb.truncated ? ` (fonte limitada a ${int(fb.cells.length)} de ${int(fb.n_cells)})` : ""}</span>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cada cor indica detecções de calor por satélite, não área queimada nem incêndio confirmado. Hexágono sem cor não garante ausência de fogo
          (nuvens, fumaça e horário das passagens escondem focos).
        </p>
      </Panel>
    </div>
  );
}
