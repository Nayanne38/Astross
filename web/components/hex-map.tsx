"use client";

// Leaflet map (client only: loaded with next/dynamic ssr:false). Canvas renderer, no basemap tiles:
// the app only talks to the FastAPI. Hexagon outlines come from h3-js (cell ids from the API).
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import { cellToBoundary } from "h3-js";

export interface MapHex { id: string; color: string; tooltip: string }
export interface MapPoint { lat: number; lon: number; color: string; stroke: string; tooltip: string }

function Layers({ hexes, points, bbox, onZoom }: { hexes: MapHex[]; points: MapPoint[]; bbox: number[]; onZoom?: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onZoom) return;
    const f = () => onZoom(map.getZoom());
    f();
    map.on("zoomend", f);
    return () => { map.off("zoomend", f); };
  }, [map, onZoom]);
  const renderer = useMemo(() => L.canvas({ padding: 0.3 }), []);

  useEffect(() => {
    const [w, s, e, n] = bbox;
    const outline = L.rectangle([[s, w], [n, e]], { color: "#3fd0b5", weight: 1, dashArray: "4 4", fill: true, fillOpacity: 0.04, interactive: false, renderer }).addTo(map);
    map.fitBounds([[s, w], [n, e]], { padding: [10, 10] });
    return () => { outline.remove(); };
  }, [map, bbox, renderer]);

  useEffect(() => {
    const g = L.layerGroup();
    for (const h of hexes) {
      L.polygon(cellToBoundary(h.id) as [number, number][], {
        renderer, color: "#0e1418", weight: 0.6, fillColor: h.color, fillOpacity: 0.92,
      }).bindTooltip(h.tooltip, { sticky: true }).addTo(g);
    }
    for (const p of points) {
      L.circleMarker([p.lat, p.lon], { renderer, radius: 3, color: p.stroke, weight: 1, fillColor: p.color, fillOpacity: 0.9 })
        .bindTooltip(p.tooltip, { sticky: true }).addTo(g);
    }
    g.addTo(map);
    return () => { g.remove(); };
  }, [map, hexes, points, renderer]);

  return null;
}

export default function HexMap({ hexes, points, bbox, height = 520, onZoom }: {
  hexes: MapHex[]; points: MapPoint[]; bbox: number[]; height?: number; onZoom?: (z: number) => void;
}) {
  const [w, s, e, n] = bbox;
  return (
    <MapContainer bounds={[[s, w], [n, e]]} preferCanvas zoomSnap={0.25} style={{ height, width: "100%", borderRadius: 10 }}
      attributionControl={true} aria-label="Mapa de detecções de calor">
      <Layers hexes={hexes} points={points} bbox={bbox} onZoom={onZoom} />
      <AttributionText />
    </MapContainer>
  );
}

function AttributionText() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution("Dados: NASA FIRMS (MODIS/VIIRS) · Hexágonos H3 res. 6");
  }, [map]);
  return null;
}
