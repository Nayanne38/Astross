"use client";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { emergencyFor } from "@/lib/emergency-numbers";

type Audience = "cidadao" | "bombeiro";

const STEPS: Record<Audience, { icon: string; t: string; d: string }[]> = {
  cidadao: [
    { icon: "🛰️", t: "Satellites keep watch", d: "NASA's VIIRS and MODIS see heat on the ground several times a day." },
    { icon: "📍", t: "We compare it with your address", d: "If a hotspot appears within 10 km of you, it goes into the alert queue." },
    { icon: "✈️", t: "You get it on Telegram", d: "Coordinates, time, satellite and a map link. At most one alert per hotspot." },
  ],
  bombeiro: [
    { icon: "🛰️", t: "Satellites keep watch", d: "We query NASA FIRMS every 15 min (VIIRS NOAA-20/21 and MODIS)." },
    { icon: "🗺️", t: "We filter by municipality", d: "We use the registered municipality's boundaries (OpenStreetMap bounding box)." },
    { icon: "🚒", t: "Your team is notified", d: "Each new hotspot arrives with coordinates, FRP and a Google Maps navigation link." },
  ],
};

const FAQ: Record<Audience, [string, string][]> = {
  cidadao: [
    ["Do I have to pay anything?", "No. The service is free and uses open NASA data."],
    ["Does an alert mean there is a fire?", "Not necessarily. It is a heat hotspot seen by satellite: it could be a controlled burn, industry or a fire. Check against what you see and, in an emergency, call your local emergency number (see the Emergency page)."],
    ["What data do you store?", "Name, phone, age, address and your Telegram, only to send the alerts. Minors need a guardian's authorization."],
    ["How do I cancel?", "Send /stop to the bot on Telegram. Your registration is deleted immediately."],
    ["Why does it sometimes take a while?", "Satellites pass over a few times a day and the data takes minutes to a few hours to become available. FIRETRACK does not replace the fire department."],
  ],
  bombeiro: [
    ["Who can sign up?", "Military firefighters, brigade members and civil defense teams. Provide your corps and municipality of operation."],
    ["Do I get every hotspot in the municipality?", "Yes, all new hotspots inside the municipality's bounding box, with no distance limit. This may include hotspots just outside the exact boundary: check the map."],
    ["How accurate is the position?", "A MODIS pixel is 1 km and a VIIRS pixel is 375 m. The coordinate is the pixel center, not the exact point of the fire."],
    ["What about latency?", "Usually minutes to a few hours after the satellite pass. Use it as support, never as your only source."],
    ["How do I leave?", "Send /stop to the bot. Your registration and Telegram link are deleted."],
  ],
};

export function HowItWorks({ kind }: { kind: Audience }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="How it works">
      {STEPS[kind].map((s, i) => (
        <li key={s.t} className="card relative overflow-hidden">
          <span className="absolute right-3 top-1 font-display text-5xl font-bold text-white/5" aria-hidden>{i + 1}</span>
          <p className="text-3xl" aria-hidden>{s.icon}</p>
          <h3 className="mt-2 font-semibold">{s.t}</h3>
          <p className="mt-1 text-sm text-muted">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}

export function Faq({ kind }: { kind: Audience }) {
  return (
    <div className="grid gap-2">
      {FAQ[kind].map(([q, a]) => (
        <details key={q} className="group rounded-xl border border-line bg-panel p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
            {q}<span className="text-brand transition-transform duration-200 group-open:rotate-45" aria-hidden>＋</span>
          </summary>
          <p className="step-in mt-2 text-sm text-fg/85">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function Trust({ kind }: { kind: Audience }) {
  const items = kind === "cidadao"
    ? ["🔒 Data used only for alerts", "🆓 Free", "🛰️ Open NASA data", "🗑️ /stop deletes everything"]
    : ["🛰️ NASA FIRMS near real time", "🗺️ Cities worldwide", "🔒 /stop deletes everything", "🆓 Free"];
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {items.map((x) => <li key={x} className="chip">{x}</li>)}
    </ul>
  );
}

export function EmergencyNote() {
  const { country } = useApp();
  const n = emergencyFor(country).data.fire.number;
  return (
    <p className="rounded-xl border border-fire/30 bg-fire/10 p-3 text-xs text-fg/85">
      A heat hotspot detected by satellite may not be a confirmed fire. In an emergency, call <b>{n}</b> (fire service{country ? "" : ", generic number: confirm locally"}) and see the{" "}
      <Link className="text-brand underline" href="/urgencia">emergency</Link> page.
    </p>
  );
}
