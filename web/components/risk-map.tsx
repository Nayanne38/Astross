"use client";
import "leaflet/dist/leaflet.css";
import { BASEMAP } from "@/lib/basemap";
import { useEffect } from "react";
import { MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";

function Fit({ bbox }: { bbox: [number, number, number, number] }) {
  const map = useMap();
  useEffect(() => { map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]); }, [map, bbox]);
  return null;
}
import { fmtPct } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import type { ForecastCell } from "@/lib/types";

import { RISK_COLORS } from "@/lib/risk-colors";

export default function RiskMap({ cells, bbox, lang, labels }: { cells: ForecastCell[]; bbox: [number, number, number, number]; lang: Lang; labels: Record<string, string> }) {
  return (
    <MapContainer bounds={[[bbox[1], bbox[0]], [bbox[3], bbox[2]]]} minZoom={2} className="h-full w-full">
      <Fit bbox={bbox} />
      <TileLayer url={BASEMAP.url} subdomains={BASEMAP.subdomains ?? "abc"} maxZoom={18} attribution="&copy; OpenStreetMap contributors &copy; CARTO" />
      {cells.filter((c) => c.boundary && c.risk_class !== "baixo").map((c) => (
        <Polygon key={c.cell_id} positions={c.boundary!} pathOptions={{ color: RISK_COLORS[c.risk_class], weight: 0.5, fillColor: RISK_COLORS[c.risk_class], fillOpacity: 0.7 }}>
          <Tooltip className="ft-tip" sticky>{labels[c.risk_class]} · {fmtPct(c.probability * 100, lang, 0)}</Tooltip>
        </Polygon>
      ))}
    </MapContainer>
  );
}
