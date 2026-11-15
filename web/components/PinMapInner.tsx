"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";

export interface PinMapProps {
  lat: number; lon: number; zoom?: number; height?: number | string;
  emoji?: string; draggable?: boolean; onMove?: (lat: number, lon: number) => void;
  circleKm?: number; bbox?: [number, number, number, number] | null;   // [w, s, e, n]
  extra?: { lat: number; lon: number; emoji: string }[];
  satellite?: boolean;
}

function pin(emoji: string) {
  return L.divIcon({ className: "", html: `<div style="font-size:30px;line-height:30px;transform:translate(-50%,-90%);filter:drop-shadow(0 2px 3px #000a)">${emoji}</div>`, iconSize: [0, 0] });
}

function Follow({ lat, lon, bbox, zoom }: { lat: number; lon: number; bbox?: PinMapProps["bbox"]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [16, 16] });
    else map.setView([lat, lon], Math.max(map.getZoom(), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, bbox?.join(",")]);
  return null;
}

function ClickToMove({ onMove }: { onMove?: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onMove?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function PinMapInner({ lat, lon, zoom = 13, height = 260, emoji = "📍", draggable, onMove, circleKm, bbox, extra = [], satellite }: PinMapProps) {
  const icon = useMemo(() => pin(emoji), [emoji]);
  const handlers = useMemo(() => ({
    dragend(e: L.LeafletEvent) { const p = (e.target as L.Marker).getLatLng(); onMove?.(p.lat, p.lng); },
  }), [onMove]);
  return (
    <MapContainer center={[lat, lon]} zoom={zoom} style={{ height, width: "100%" }} className="rounded-xl" attributionControl>
      {satellite
        ? <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={18} />
        : <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />}
      <Follow lat={lat} lon={lon} bbox={bbox} zoom={zoom} />
      {draggable && <ClickToMove onMove={onMove} />}
      {circleKm && <Circle center={[lat, lon]} radius={circleKm * 1000} pathOptions={{ color: "#f97316", weight: 2, fillOpacity: 0.08 }} />}
      {bbox && <Rectangle bounds={[[bbox[1], bbox[0]], [bbox[3], bbox[2]]]} pathOptions={{ color: "#f97316", weight: 2, fillOpacity: 0.06 }} />}
      <Marker position={[lat, lon]} icon={icon} draggable={draggable} eventHandlers={handlers} />
      {extra.map((m, i) => <Marker key={i} position={[m.lat, m.lon]} icon={pin(m.emoji)} />)}
    </MapContainer>
  );
}
