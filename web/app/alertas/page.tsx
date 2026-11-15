import type { Metadata } from "next";
import Link from "next/link";
import AlertFlow from "@/components/AlertFlow";
import { EmergencyNote, Faq, HowItWorks, Trust } from "@/components/alert-info";

export const metadata: Metadata = {
  title: "Fire alerts — FIRETRACK",
  description: "Get a Telegram alert when NASA satellites detect fire near your address.",
};

export default function Page() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <AlertFlow />
        <aside className="grid gap-4 lg:sticky lg:top-24">
          <div className="card">
            <p className="kicker">Why sign up</p>
            <p className="mt-2 text-sm text-fg/85">
              Smoke often arrives before the news. With the alert you find out, within minutes or a few hours, that a satellite saw fire near home.
            </p>
            <div className="mt-3"><Trust kind="cidadao" /></div>
          </div>
          <EmergencyNote />
          <p className="text-center text-sm text-muted">
            Are you a firefighter or brigade member? <Link className="text-brand underline" href="/bombeiros">Sign up here</Link>.
          </p>
        </aside>
      </div>

      <section aria-labelledby="como">
        <p className="kicker">How it works</p>
        <h2 id="como" className="h2 mb-4 mt-1">From satellite to your phone</h2>
        <HowItWorks kind="cidadao" />
      </section>

      <section aria-labelledby="faq">
        <p className="kicker">Questions</p>
        <h2 id="faq" className="h2 mb-4 mt-1">Frequently asked questions</h2>
        <Faq kind="cidadao" />
      </section>
    </div>
  );
}
