"use client";
import "leaflet/dist/leaflet.css";
import { BASEMAP } from "@/lib/basemap";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { cellValue, type Filters } from "@/lib/filters";
import { fmtInt, tpl } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { classColors, classOf, quantileBreaks } from "@/lib/palettes";
import type { Detection, ForecastCell, HexCell } from "@/lib/types";
import { frpClasses } from "@/lib/frp";
import { RISK_COLORS } from "@/lib/risk-colors";

export type BBox = [number, number, number, number];

/** Reset / fly-to requests arrive as window events so the sidebar and toolbar can stay outside the map. */
function Bus({ bbox }: { bbox: BBox }) {
  const map = useMap();
  useEffect(() => { map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]); }, [map, bbox]);
  useEffect(() => {
    const fly = (e: Event) => { const { lat, lon } = (e as CustomEvent).detail; map.flyTo([lat, lon], 10); };
    const reset = () => map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    const size = () => setTimeout(() => map.invalidateSize(), 50);
    window.addEventListener("firetrack:flyto", fly);
    window.addEventListener("firetrack:reset", reset);
    window.addEventListener("firetrack:resize", size);
    return () => {
      window.removeEventListener("firetrack:flyto", fly);
      window.removeEventListener("firetrack:reset", reset);
      window.removeEventListener("firetrack:resize", size);
    };
  }, [map, bbox]);
  return null;
}

/** Click-and-drag rectangle. While drawing, map dragging is off so the drag draws instead of panning. */
function DrawRect({ active, onDone }: { active: boolean; onDone: (b: BBox) => void }) {
  const map = useMap();
  const start = useRef<L.LatLng | null>(null);
  const [cur, setCur] = useState<L.LatLngBounds | null>(null);
  useEffect(() => {
    if (active) { map.dragging.disable(); map.getContainer().style.cursor = "crosshair"; }
    else { map.dragging.enable(); map.getContainer().style.cursor = ""; }
    return () => { map.dragging.enable(); map.getContainer().style.cursor = ""; };
  }, [active, map]);
  useMapEvents({
    mousedown(e) { if (active) start.current = e.latlng; },
    mousemove(e) { if (active && start.current) setCur(L.latLngBounds(start.current, e.latlng)); },
    mouseup(e) {
      if (!active || !start.current) return;
      const b = L.latLngBounds(start.current, e.latlng);
      start.current = null; setCur(null);
      if (Math.abs(b.getEast() - b.getWest()) > 0.01 && Math.abs(b.getNorth() - b.getSouth()) > 0.01) {
        onDone([+b.getWest().toFixed(4), +b.getSouth().toFixed(4), +b.getEast().toFixed(4), +b.getNorth().toFixed(4)]);
      }
    },
    keydown(e) { if (e.originalEvent.key === "Escape") { start.current = null; setCur(null); } },
  });
  return cur ? <Rectangle bounds={cur} pathOptions={{ color: "#3fd0b5", weight: 2, dashArray: "6 4", fillOpacity: 0.08 }} /> : null;
}

function Locate({ trigger, onMsg }: { trigger: number; onMsg: (m: string) => void }) {
  const map = useMap();
  const [pos, setPos] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!trigger) return;
    if (!navigator.geolocation) { onMsg("unsupported"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const ll: [number, number] = [p.coords.latitude, p.coords.longitude]; setPos(ll); map.flyTo(ll, 9); onMsg("ok"); },
      () => onMsg("denied"), { timeout: 8000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const icon = L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#3fd0b5;border:2px solid #fff;box-shadow:0 0 0 4px rgba(63,208,181,.3)"></div>', iconSize: [14, 14] });
  return pos ? <Marker position={pos} icon={icon} /> : null;
}

const FRP_COLOR = { baixa: "#f7d13d", media: "#fb9b06", alta: "#ed6925", muito_alta: "#c4172c" } as const;

/** Thousands of detections: one canvas circle each, and a single shared tooltip (not one React Tooltip per point). */
function Points({ points, labels, fc }: { points: Detection[]; labels: Props["pointLabels"]; fc: ReturnType<typeof frpClasses> }) {
  const map = useMap();
  const tip = useRef<L.Tooltip | null>(null);
  useEffect(() => {
    tip.current = L.tooltip({ className: "ft-tip", direction: "top", offset: [0, -6], opacity: 1 });
    return () => { tip.current?.remove(); };
  }, [map]);
  const gmaps = (d: Detection) => `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`;
  const gsat = (d: Detection) => `https://www.google.com/maps/@${d.lat},${d.lon},18z/data=!3m1!1e3`;
  const open = (d: Detection) => {
    const hh = String(d.time_utc).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2");
    const html = `<div style="min-width:210px"><b>${d.satellite}</b> · ${d.date} ${hh} UTC<br/>FRP ${d.frp != null ? d.frp.toFixed(1) : "—"} MW · ${labels.confidence}: ${d.confidence_class}<br/><span style="opacity:.7">${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}</span><div style="display:flex;gap:8px;margin-top:8px"><a href="${gmaps(d)}" target="_blank" rel="noreferrer" style="padding:4px 8px;border-radius:6px;background:#3fd0b5;color:#04221d;font-weight:600;text-decoration:none">Open in Google Maps</a><a href="${gsat(d)}" target="_blank" rel="noreferrer" style="padding:4px 8px;border-radius:6px;border:1px solid #888;text-decoration:none;color:inherit">Satellite view</a></div></div>`;
    tip.current?.remove();
    L.popup({ offset: [0, -4] }).setLatLng([d.lat, d.lon]).setContent(html).openOn(map);
  };
  const show = (d: Detection) => {
    const hh = String(d.time_utc).padStart(4, "0").replace(/(\d\d)(\d\d)/, "$1:$2");
    const html = `<div><b>${d.satellite}</b> · ${d.date} ${hh} UTC</div><div>FRP ${d.frp != null ? d.frp.toFixed(1) : "—"} MW · ${labels.confidence}: ${d.confidence_class} · ${d.daynight === "N" ? labels.night : labels.day}</div><div style="opacity:.7">${labels.disclaimer}</div>`;
    tip.current?.setContent(html).setLatLng([d.lat, d.lon]).addTo(map);
  };
  return (
    <>
      {points.map((d, i) => {
        const col = FRP_COLOR[fc.of(d)];
        const modis = d.sensor_family === "MODIS";
        return (
          <CircleMarker key={i} center={[d.lat, d.lon]} radius={modis ? 5 : 3.5}
            pathOptions={{ color: modis ? "#fff" : col, weight: modis ? 1 : 0.5, fillColor: col, fillOpacity: 0.85 }}
            eventHandlers={{ mouseover: () => show(d), mouseout: () => tip.current?.remove(), click: () => open(d) }} />
        );
      })}
    </>
  );
}

export function hexLegend(cells: HexCell[], f: Filters) {
  const vals = cells.map((c) => cellValue(c, f.sensor, f.category)).filter((v): v is number => v !== null);
  return { breaks: quantileBreaks(vals, f.classes), colors: classColors(f.palette, f.classes, f.invert), vals };
}

interface Props {
  layer: Filters["layer"];
  cells: HexCell[]; points: Detection[]; risk: ForecastCell[];
  filters: Filters; bbox: BBox; lang: Lang; unit: string;
  riskLabels: Record<string, string>; pointLabels: { day: string; night: string; confidence: string; disclaimer: string };
  drawing: boolean; onDraw: (b: BBox) => void; locateTrigger: number; onLocate: (m: string) => void;
  onCell?: (c: HexCell) => void;
}

export default function HexMap(p: Props) {
  const { filters: f, lang } = p;
  const { breaks, colors } = hexLegend(p.cells, f);
  const fc = frpClasses(p.points);
  return (
    <MapContainer bounds={[[p.bbox[1], p.bbox[0]], [p.bbox[3], p.bbox[2]]]} minZoom={2} worldCopyJump className="h-full w-full" preferCanvas>
      <TileLayer url={BASEMAP.url} subdomains={BASEMAP.subdomains ?? "abc"} maxZoom={18} attribution="&copy; OpenStreetMap contributors &copy; CARTO" />
      <Bus bbox={p.bbox} />
      <DrawRect active={p.drawing} onDone={p.onDraw} />
      <Locate trigger={p.locateTrigger} onMsg={p.onLocate} />
      {f.bbox && <Rectangle bounds={[[f.bbox[1], f.bbox[0]], [f.bbox[3], f.bbox[2]]]} pathOptions={{ color: "#3fd0b5", weight: 2, fillOpacity: 0.04 }} interactive={false} />}

      {p.layer === "densidade" && p.cells.map((c) => {
        const v = cellValue(c, f.sensor, f.category);
        if (v === null || !c.boundary) return null;
        const col = colors[classOf(v, breaks)];
        return (
          <Polygon key={c.cell_id} positions={c.boundary} pathOptions={{ color: col, weight: 0.5, fillColor: col, fillOpacity: 0.75 }}
            eventHandlers={{ click: () => p.onCell?.(c) }}>
            <Tooltip className="ft-tip" sticky><b className="tnum">{fmtInt(v, lang)}</b> {p.unit}</Tooltip>
          </Polygon>
        );
      })}

      {p.layer === "focos" && <Points points={p.points} labels={p.pointLabels} fc={fc} />}

      {p.layer === "risco" && p.risk.filter((c) => c.boundary && c.risk_class !== "baixo").map((c) => (
        <Polygon key={c.cell_id} positions={c.boundary!} pathOptions={{ color: RISK_COLORS[c.risk_class], weight: 0.5, fillColor: RISK_COLORS[c.risk_class], fillOpacity: 0.7 }}>
          <Tooltip className="ft-tip" sticky>{p.riskLabels[c.risk_class]} · {tpl("{p}%", { p: Math.round(c.probability * 100) })}</Tooltip>
        </Polygon>
      ))}
    </MapContainer>
  );
}
