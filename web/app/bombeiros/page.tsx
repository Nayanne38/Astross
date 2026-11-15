import type { Metadata } from "next";
import Link from "next/link";
import AlertFlow from "@/components/AlertFlow";
import { EmergencyNote, Faq, HowItWorks, Trust } from "@/components/alert-info";

export const metadata: Metadata = {
  title: "Firefighters and brigades — FIRETRACK",
  description: "Sign-up for firefighters and brigade members to receive, on Telegram, the heat hotspots detected in their municipality.",
};

const CONTENT = [
  "Every new hotspot inside the municipality, with no distance limit",
  "Coordinates, time (UTC), satellite, confidence and FRP",
  "Direct links to Google Maps and the FIRETRACK map",
];

export default function Page() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12">
      <header className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-header/60 via-panel to-panel p-6 sm:p-8">
        <p className="kicker">For firefighters and brigades</p>
        <h1 className="h1 mt-2 max-w-3xl">Know where the satellite saw fire in your municipality</h1>
        <p className="mt-3 max-w-2xl text-fg/85">
          Operational alerts on Telegram, with coordinates and a navigation link, for every new hotspot NASA detects in your area of operation.
        </p>
        <div className="mt-4"><Trust kind="bombeiro" /></div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <AlertFlow initialKind="bombeiro" />
        <aside className="grid gap-4 lg:sticky lg:top-24">
          <div className="card">
            <p className="kicker">What arrives on Telegram</p>
            <ul className="mt-2 grid gap-2 text-sm text-fg/85">
              {CONTENT.map((c) => <li key={c} className="flex gap-2"><span className="text-brand" aria-hidden>✓</span>{c}</li>)}
            </ul>
          </div>
          <EmergencyNote />
          <p className="text-center text-sm text-muted">
            Want alerts near home only? <Link className="text-brand underline" href="/alertas">Alerts for residents</Link>.
          </p>
        </aside>
      </div>

      <section aria-labelledby="como">
        <p className="kicker">How it works</p>
        <h2 id="como" className="h2 mb-4 mt-1">From satellite to your team</h2>
        <HowItWorks kind="bombeiro" />
      </section>

      <section aria-labelledby="faq">
        <p className="kicker">Questions</p>
        <h2 id="faq" className="h2 mb-4 mt-1">Frequently asked questions</h2>
        <Faq kind="bombeiro" />
      </section>
    </div>
  );
}
