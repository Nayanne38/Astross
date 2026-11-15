"use client";

import dynamic from "next/dynamic";
import type { PinMapProps } from "./PinMapInner";

const Inner = dynamic(() => import("./PinMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-[260px] place-items-center rounded-xl border border-line bg-panel-2 text-sm text-muted">Carregando mapa…</div>,
});

export default function PinMap(props: PinMapProps) {
  return <Inner {...props} />;
}
