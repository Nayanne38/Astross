"use client";

import dynamic from "next/dynamic";
import type { WorldMapProps } from "./WorldMapInner";

// Leaflet touches `window`, so the map renders only in the browser.
const Inner = dynamic(() => import("./WorldMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-[520px] place-items-center rounded-xl border border-line bg-panel text-muted">Carregando mapa…</div>,
});

export default function WorldMap(props: WorldMapProps) {
  return <Inner {...props} />;
}
