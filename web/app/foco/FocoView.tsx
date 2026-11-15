"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import PinMap from "@/components/PinMap";
import { useApp } from "@/components/app-state";
import { emergencyFor } from "@/lib/emergency-numbers";

/** Landing page of the "ver o local no aplicativo" link sent in each alert. */
export default function FocoView() {
  const q = useSearchParams();
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  const [sat, setSat] = useState(true);
  const { country } = useApp();
  const fireNo = emergencyFor(country).data.fire.number;
  if (!q.get("lat") || !q.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return <div className="card mx-auto max-w-md">Invalid hotspot link. <Link className="text-fire-2 hover:underline" href="/alertas">Go to alerts</Link></div>;
  }
  const local = q.get("local");
  const meta = [q.get("sat"), q.get("t") ? q.get("t") : null].filter(Boolean).join(" · ");
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <p className="kicker">Heat hotspot detected by satellite</p>
        <h1 className="mt-1 text-2xl font-bold">{local ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`}</h1>
        {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
      </div>
      <div className="relative">
        <PinMap lat={lat} lon={lon} zoom={14} emoji="🔥" circleKm={0.375} satellite={sat} height="60vh" />
        <button className="map-btn absolute right-3 top-3 z-[500]" onClick={() => setSat(!sat)}>{sat ? "Street map" : "Satellite"}</button>
      </div>
      <p className="text-xs text-muted">The circle has a 375 m radius, the size of a VIIRS pixel: the fire is somewhere inside this area, not exactly at the pin.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <a className="btn justify-center" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`} target="_blank" rel="noreferrer">🧭 Get directions (Google Maps)</a>
        <a className="btn-ghost justify-center" href={`tel:${fireNo}`}>📞 Call {fireNo} (fire service)</a>
      </div>
      <div className="card text-sm text-muted">
        <p className="font-semibold text-fg">Warning</p>
        <p className="mt-1">A heat hotspot is a thermal detection by satellite: it can be a controlled burn, a wildfire or another heat source. Do not approach the fire. In an emergency, call {fireNo} (fire service) or your local emergency number.</p>
      </div>
    </div>
  );
}
