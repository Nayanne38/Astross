"use client";

// Leaflet map (client only: loaded with next/dynamic ssr:false). Canvas renderers, never default marker icons.
// Panes: basemap < hexagons (canvas) < points (canvas) < region outline / drawing (svg).
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import { cellToBoundary } from "h3-js";
import { consumeFlyTo, onFlyTo } from "@/lib/map-bus";
import { copy } from "@/content/copy";

export interface MapHex { id: string; color: string; opacity: number; tooltip: string }
export interface MapPoint { lat: number; lon: number; color: string; radius: number; tooltip: string }
export type Basemap = "escuro" | "claro" | "satelite";
export type DrawMode = "rect" | "poly" | null;

const M = copy.map;
// Verified 2026-11-15: tile.openstreetmap.org policy (attribution, no prefetch/offline);
// CARTO basemaps need a CARTO-issued key (optional NEXT_PUBLIC_CARTO_KEY) and OSM + CARTO attribution.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function Basemaps({ basemap, onTileError }: { basemap: Basemap; onTileError: (failed: boolean) => void }) {
  const map = useMap();
  useEffect(() => {
    if (basemap === "satelite") return; // licence not verified: option disabled in the UI
    const dark = basemap === "escuro";
    const layer = dark && CARTO_KEY
      ? L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
          { subdomains: "abcd", maxZoom: 19, attribution: `${OSM_ATTR}, &copy; <a href="https://carto.com/attributions">CARTO</a>` })
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          { maxZoom: 19, attribution: OSM_ATTR, className: dark ? "tiles-dark" : "" });
    let errors = 0;
    layer.on("tileerror", () => { errors += 1; if (errors >= 4) onTileError(true); });
    layer.on("load", () => { if (errors === 0) onTileError(false); });
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map, basemap, onTileError]);
  return null;
}

function Controls({ onZoom, onMap }: { onZoom?: (z: number) => void; onMap?: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    const zoom = L.control.zoom({ position: "topright", zoomInTitle: M.zoomIn, zoomOutTitle: M.zoomOut }).addTo(map);
    const scale = L.control.scale({ metric: true, imperial: false, position: "bottomright" }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(M.dataAttribution);
    onMap?.(map);
    // keep the map sized when the sidebar drawer, fullscreen or the window change
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => { zoom.remove(); scale.remove(); map.attributionControl.removeAttribution(M.dataAttribution); ro.disconnect(); };
  }, [map, onMap]);
  useEffect(() => {
    if (!onZoom) return;
    const f = () => onZoom(map.getZoom());
    f();
    map.on("zoomend", f);
    return () => { map.off("zoomend", f); };
  }, [map, onZoom]);
  // sidebar search: "lat, lon" → fly there and mark the point (position is never stored or sent)
  useEffect(() => {
    let marker: L.CircleMarker | null = null;
    const go = (t: { lat: number; lon: number; label: string }) => {
      marker?.remove();
      marker = L.circleMarker([t.lat, t.lon], { pane: "outline", radius: 7, color: "#3fd0b5", weight: 2, fillOpacity: 0.2 })
        .bindTooltip(t.label).addTo(map);
      map.flyTo([t.lat, t.lon], Math.max(map.getZoom(), 9), { duration: 0.6 });
    };
    const pending = consumeFlyTo();
    if (pending) go(pending);
    const off = onFlyTo(go);
    return () => { off(); marker?.remove(); };
  }, [map]);
  return null;
}

function Panes() {
  const map = useMap();
  useMemo(() => {
    for (const [name, z] of [["hexes", 410], ["points", 420], ["outline", 450]] as const) {
      if (!map.getPane(name)) map.createPane(name).style.zIndex = String(z);
    }
  }, [map]);
  return null;
}

function Outline({ bbox, area }: { bbox: number[]; area: string | null }) {
  const map = useMap();
  useEffect(() => {
    const [w, s, e, n] = bbox;
    const region: GeoJSON.Feature = {
      type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    };
    const g = L.geoJSON(region, { pane: "outline", interactive: false, style: { color: "#3fd0b5", weight: 1.2, dashArray: "5 5", fill: false } }).addTo(map);
    let a: L.Layer | null = null;
    if (area?.startsWith("bbox:")) {
      const [aw, as, ae, an] = area.slice(5).split(",").map(Number);
      a = L.rectangle([[as, aw], [an, ae]], { pane: "outline", interactive: false, color: "#ffffff", weight: 2, fillOpacity: 0.04 }).addTo(map);
    } else if (area?.startsWith("poly:")) {
      const pts = area.slice(5).split(";").map((p) => { const [lon, lat] = p.split(",").map(Number); return [lat, lon] as [number, number]; });
      a = L.polygon(pts, { pane: "outline", interactive: false, color: "#ffffff", weight: 2, fillOpacity: 0.04 }).addTo(map);
    }
    return () => { g.remove(); a?.remove(); };
  }, [map, bbox, area]);
  return null;
}

function FitOnChange({ bbox, resetKey }: { bbox: number[]; resetKey: number }) {
  const map = useMap();
  useEffect(() => {
    const [w, s, e, n] = bbox;
    map.fitBounds([[s, w], [n, e]], { padding: [10, 10] });
  }, [map, bbox, resetKey]);
  return null;
}

function DataLayers({ hexes, points, onCellClick }: { hexes: MapHex[]; points: MapPoint[]; onCellClick?: (id: string) => void }) {
  const map = useMap();
  const hexRenderer = useMemo(() => L.canvas({ padding: 0.3, pane: "hexes" }), []);
  const ptRenderer = useMemo(() => L.canvas({ padding: 0.3, pane: "points" }), []);
  const click = useRef(onCellClick);
  useEffect(() => { click.current = onCellClick; }, [onCellClick]);

  useEffect(() => {
    const g = L.layerGroup();
    for (const h of hexes) {
      L.polygon(cellToBoundary(h.id) as [number, number][], {
        pane: "hexes", renderer: hexRenderer, color: "#0e1418", weight: 0.6, fillColor: h.color, fillOpacity: h.opacity,
      }).bindTooltip(h.tooltip, { sticky: true }).on("click", () => click.current?.(h.id)).addTo(g);
    }
    g.addTo(map);
    return () => { g.remove(); };
  }, [map, hexes, hexRenderer]);

  useEffect(() => {
    const g = L.layerGroup();
    for (const p of points) {
      L.circleMarker([p.lat, p.lon], { pane: "points", renderer: ptRenderer, radius: p.radius, color: "#e9f0f3", opacity: 0.75, weight: 1, fillColor: p.color, fillOpacity: 0.9 })
        .bindTooltip(p.tooltip, { sticky: true }).addTo(g);
    }
    g.addTo(map);
    return () => { g.remove(); };
  }, [map, points, ptRenderer]);
  return null;
}

/** Rectangle (drag) and polygon (click vertices; double click or click the first vertex closes; Esc cancels). */
function DrawTool({ mode, onDone, onCancel }: { mode: DrawMode; onDone: (area: string) => void; onCancel: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (!mode) return;
    const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    map.doubleClickZoom.disable();
    const style = { pane: "outline", color: "#ffffff", weight: 2, dashArray: "4 4", fillOpacity: 0.05, interactive: false };
    let shape: L.Layer | null = null;
    let start: L.LatLng | null = null;
    const pts: L.LatLng[] = [];
    let preview: L.Polyline | null = null;

    const finishPoly = () => {
      if (pts.length < 3) return;
      onDone(`poly:${pts.map((p) => `${r4(p.lng)},${r4(p.lat)}`).join(";")}`);
    };
    const handlers: Record<string, (e: L.LeafletMouseEvent) => void> = mode === "rect" ? {
      mousedown: (e) => { start = e.latlng; map.dragging.disable(); },
      mousemove: (e) => {
        if (!start) return;
        shape?.remove();
        shape = L.rectangle(L.latLngBounds(start, e.latlng), style).addTo(map);
      },
      mouseup: (e) => {
        if (!start) return;
        const b = L.latLngBounds(start, e.latlng);
        start = null;
        map.dragging.enable();
        if (b.getEast() - b.getWest() < 1e-3 || b.getNorth() - b.getSouth() < 1e-3) return;
        onDone(`bbox:${r4(b.getWest())},${r4(b.getSouth())},${r4(b.getEast())},${r4(b.getNorth())}`);
      },
    } : {
      click: (e) => {
        if (pts.length >= 3) {
          const first = map.latLngToContainerPoint(pts[0]);
          if (first.distanceTo(map.latLngToContainerPoint(e.latlng)) < 12) { finishPoly(); return; }
        }
        pts.push(e.latlng);
        shape?.remove();
        shape = L.polygon(pts, style).addTo(map);
      },
      mousemove: (e) => {
        if (!pts.length) return;
        preview?.remove();
        preview = L.polyline([pts[pts.length - 1], e.latlng], { ...style, fill: false }).addTo(map);
      },
      dblclick: () => finishPoly(),
    };
    for (const [ev, h] of Object.entries(handlers)) map.on(ev, h as L.LeafletEventHandlerFn);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => {
      for (const [ev, h] of Object.entries(handlers)) map.off(ev, h as L.LeafletEventHandlerFn);
      window.removeEventListener("keydown", onKey);
      shape?.remove(); preview?.remove();
      container.style.cursor = "";
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [map, mode, onDone, onCancel]);
  return null;
}

export default function HexMap({
  hexes, points, bbox, area, basemap, drawMode, resetKey, onZoom, onMap, onCellClick, onDrawn, onDrawCancel, onTileError,
}: {
  hexes: MapHex[]; points: MapPoint[]; bbox: number[]; area: string | null; basemap: Basemap; drawMode: DrawMode; resetKey: number;
  onZoom?: (z: number) => void; onMap?: (m: L.Map) => void; onCellClick?: (id: string) => void;
  onDrawn: (area: string) => void; onDrawCancel: () => void; onTileError: (failed: boolean) => void;
}) {
  const [w, s, e, n] = bbox;
  return (
    <MapContainer bounds={[[s, w], [n, e]]} preferCanvas zoomControl={false} minZoom={3} zoomSnap={0.25} keyboard
      style={{ height: "100%", width: "100%" }} attributionControl aria-label={M.ariaMap}>
      <Panes />
      <Basemaps basemap={basemap} onTileError={onTileError} />
      <Controls onZoom={onZoom} onMap={onMap} />
      <FitOnChange bbox={bbox} resetKey={resetKey} />
      <DataLayers hexes={hexes} points={points} onCellClick={onCellClick} />
      <Outline bbox={bbox} area={area} />
      <DrawTool mode={drawMode} onDone={onDrawn} onCancel={onDrawCancel} />
    </MapContainer>
  );
}
