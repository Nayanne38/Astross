"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, LayersControl, MapContainer, Polygon, Rectangle, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import {
  type Detection, type ForecastCell, type HexCell, RISK, fireColor, fmtDate, fmtInt, fmtNum, fmtPct,
} from "@/lib/fire-data";

export interface WorldMapProps {
  bbox?: [number, number, number, number] | null;   // [west, south, east, north]
  regionName?: string;
  hexes?: HexCell[];
  hexMax?: number;
  detections?: Detection[];
  forecast?: ForecastCell[];
  initial?: "world" | "region";
  height?: number | string;
  layers?: Partial<Record<LayerKey, boolean>>;
}
type LayerKey = "hex" | "detections" | "forecast";
const LAYER_LABEL: Record<LayerKey, string> = { hex: "Fire cells (H3)", detections: "Recent hotspots", forecast: "7-day risk" };

function toBounds(b: [number, number, number, number]): LatLngBoundsExpression {
  return [[b[1], b[0]], [b[3], b[2]]];
}

function FlyTo({ target }: { target: { bounds?: LatLngBoundsExpression; world?: boolean; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.world) map.flyTo([5, -30], 2, { duration: 1.2 });
    else if (target.bounds) map.flyToBounds(target.bounds, { padding: [20, 20], duration: 1.2 });
  }, [target, map]);
  return null;
}

export default function WorldMapInner({
  bbox, regionName, hexes = [], hexMax = 0, detections = [], forecast = [], initial = "world", height = 520, layers,
}: WorldMapProps) {
  const available: LayerKey[] = useMemo(() => {
    const a: LayerKey[] = [];
    if (hexes.length) a.push("hex");
    if (forecast.length) a.push("forecast");
    if (detections.length) a.push("detections");
    return a;
  }, [hexes.length, forecast.length, detections.length]);
  const [on, setOn] = useState<Record<LayerKey, boolean>>({ hex: true, detections: false, forecast: true, ...layers });
  const [target, setTarget] = useState<{ bounds?: LatLngBoundsExpression; world?: boolean; n: number } | null>(null);
  const bounds = bbox ? toBounds(bbox) : undefined;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line" style={{ height }}>
      <MapContainer
        preferCanvas
        worldCopyJump
        minZoom={2}
        maxZoom={11}
        center={initial === "region" && bbox ? [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2] : [5, -30]}
        zoom={initial === "region" && bbox ? 5 : 2}
        className="h-full w-full"
        attributionControl
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        {/* Basemaps that need no API key (Esri: attribution required; OSM: light use policy) */}
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Dark">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              attribution="Base: Esri, HERE, Garmin, © OpenStreetMap | Focos: NASA FIRMS (MODIS/VIIRS)"
              maxNativeZoom={16}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagens: Esri, Maxar, Earthstar Geographics | Focos: NASA FIRMS (MODIS/VIIRS)"
              maxNativeZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Ruas (OSM)">
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors | Focos: NASA FIRMS (MODIS/VIIRS)"
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <FlyTo target={target} />
        {bounds && (
          <Rectangle bounds={bounds} pathOptions={{ color: "#f59e0b", weight: 1.5, dashArray: "6 6", fill: false }}>
            <Tooltip sticky>{regionName ?? "Region with data"} — monitored area</Tooltip>
          </Rectangle>
        )}
        {on.hex && hexes.map((h) => h.boundary && (
          <Polygon key={h.cell_id} positions={h.boundary}
            pathOptions={{ stroke: false, fillColor: fireColor(h.value, hexMax), fillOpacity: 0.8 }}>
            <Tooltip sticky>
              <b>{fmtNum(h.value, 1)}</b> cell-days (harmonized)<br />
              {h.fire_days} fire days · MODIS {fmtInt(h.modis_count)} · VIIRS {fmtInt(h.viirs_count)}
            </Tooltip>
          </Polygon>
        ))}
        {on.forecast && forecast.map((f) => f.boundary && (
          <Polygon key={f.cell_id} positions={f.boundary}
            pathOptions={{ stroke: false, fillColor: RISK[f.risk_class].color, fillOpacity: f.risk_class === "baixo" ? 0.35 : 0.75 }}>
            <Tooltip sticky>
              Risk <b>{RISK[f.risk_class].label}</b>: {fmtPct(f.probability, 1)} chance of fire in 7 days
            </Tooltip>
          </Polygon>
        ))}
        {on.detections && detections.map((d, i) => (
          <CircleMarker key={i} center={[d.lat, d.lon]} radius={2.5}
            pathOptions={{ color: d.sensor_family === "VIIRS" ? "#fde047" : "#f472b6", weight: 0, fillOpacity: 0.9 }}>
            <Tooltip>
              {d.satellite} ({d.sensor_family}) · {fmtDate(d.date)} {String(d.time_utc).padStart(4, "0")} UTC
              {d.frp != null && <> · FRP {fmtNum(d.frp, 1)} MW</>}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <button className="map-btn" onClick={() => setTarget({ world: true, n: Date.now() })}>🌎 World</button>
          {bounds && <button className="map-btn" onClick={() => setTarget({ bounds, n: Date.now() })}>🔥 {regionName ?? "Region"}</button>}
        </div>
        {available.length > 0 && (
          <div className="pointer-events-auto flex flex-col gap-1 rounded-lg bg-panel/90 p-2 text-xs backdrop-blur">
            {available.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={on[k]} onChange={() => setOn({ ...on, [k]: !on[k] })} />
                {LAYER_LABEL[k]}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-7 left-2 z-[500] rounded-lg bg-panel/90 p-2 text-[11px] backdrop-blur">
        {on.forecast && forecast.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <b className="mb-0.5">Fire chance (7 days)</b>
            {(Object.keys(RISK) as (keyof typeof RISK)[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RISK[k].color }} />
                {RISK[k].label} <span className="text-muted">{RISK[k].range}</span>
              </span>
            ))}
          </div>
        ) : on.hex && hexes.length > 0 ? (
          <div>
            <b>Fire cell-days</b>
            <div className="mt-1 h-2 w-36 rounded" style={{ background: "linear-gradient(90deg,#fff1c1,#fec44f,#fe9929,#ec7014,#cc4c02,#8c2d04,#4a1402)" }} />
            <div className="flex justify-between text-muted"><span>less</span><span>more</span></div>
          </div>
        ) : (
          <span className="text-muted">Dashed outline = monitored area</span>
        )}
      </div>
    </div>
  );
}
