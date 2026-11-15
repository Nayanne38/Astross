import Link from "next/link";
import { ExternalLink, MapPin, Phone, ShieldAlert } from "lucide-react";
import { urg as U } from "@/content/copy";
import { EMERGENCY } from "@/content/emergency";

export const metadata = { title: "Urgência · FIRETRACK" };

const t = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** Calm, static page: emergency numbers (single config file), notice and a link to the last-24 h map preset. */
export default function UrgenciaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">{U.title}</h1>
        <p className="text-lg">{U.lead}</p>
        <p className="flex items-start gap-2 rounded-lg border border-border bg-panel p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-fire" aria-hidden /> <strong>{U.notice}</strong>
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {EMERGENCY.contacts.map((c) => (
          <li key={c.number} className="rounded-xl border border-border bg-panel p-4">
            <p className="text-sm text-muted-foreground">{c.name}</p>
            <a href={`tel:${c.number}`} aria-label={`${U.call} ${c.name}, ${c.number.split("").join(" ")}`}
              className="mt-1 flex min-h-11 items-center gap-2 font-heading text-4xl font-bold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <Phone className="size-6 text-fire" aria-hidden /> {c.number}
            </a>
            <p className="mt-2 text-sm">{c.when}</p>
          </li>
        ))}
      </ul>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="mb-2 font-heading text-base font-semibold">{U.safetyTitle}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">{U.safety.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>

      <section className="space-y-1">
        <Link href="/?period=1d&layer=focos"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <MapPin className="size-4" aria-hidden /> {U.see24h}
        </Link>
        <p className="text-xs text-muted-foreground">{U.see24hNote}</p>
        <p className="text-xs text-muted-foreground">{U.noAlerts}</p>
      </section>

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        <p>{t(U.sources, { d: EMERGENCY.checkedOn })}</p>
        <ul className="mt-1 space-y-1">
          {EMERGENCY.sources.map((s) => (
            <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">{s.label} <ExternalLink className="size-3" aria-hidden /></a></li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
