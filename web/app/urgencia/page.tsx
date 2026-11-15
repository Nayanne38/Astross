"use client";
import Link from "next/link";
import { useApp } from "@/components/app-state";
import { COUNTRY_CODES, emergencyFor, type Contact } from "@/lib/emergency-numbers";

export default function Page() {
  const { t, country, setCountry } = useApp();
  const u = t.urg, e = t.emergency;
  const { data, listed } = emergencyFor(country);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const label = country && listed ? names.of(country) : null;
  const contacts: Contact[] = [data.fire, ...(data.general ? [data.general] : [])];
  const L = { yours: "Numbers for", unknown: "We could not find your country in the list.", pick: "Country", confirm: "Confirm with an official local source: these are the nationally published numbers and may change.", auto: "Detected from your connection; you can change it." };
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-bold">{u.title}</h1>
      <p className="text-lg">{u.lead}</p>
      <p className="rounded-lg border border-line bg-panel p-3 text-sm text-ink-2">{u.notice}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-3" htmlFor="country">{L.pick}</label>
        <select id="country" value={listed ? country ?? "" : ""} onChange={(ev) => setCountry(ev.target.value)} className="rounded-md border border-line bg-panel-2 px-2 py-2 text-sm">
          {!listed && <option value="">—</option>}
          {COUNTRY_CODES.map((cc) => <option key={cc} value={cc}>{names.of(cc)}</option>)}
        </select>
        <span className="text-xs text-ink-3">{listed ? L.auto : L.unknown}</span>
      </div>

      <h2 className="font-display text-xl font-semibold">{label ? `${L.yours} ${label}` : L.unknown}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {contacts.map((c) => (
          <a key={c.number + c.en} href={`tel:${c.number}`} className="press rounded-xl border border-fire bg-panel p-5 hover:bg-panel-2">
            <div className="text-xs uppercase text-ink-3">{u.call}</div>
            <div className="font-display text-5xl font-bold text-fire tnum">{c.number}</div>
            <div className="mt-1 font-semibold">{c.en}</div>
            <p className="text-sm text-ink-2">{c.whenEn}</p>
          </a>
        ))}
      </div>
      {!(listed && data.verified) && <p className="text-xs text-fire">{L.confirm}</p>}

      <section>
        <h2 className="font-display text-xl font-semibold">{u.safetyTitle}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{u.safety.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <Link href="/" className="btn">{u.see24h}</Link>
      <p className="text-xs text-ink-3">{u.see24hNote} {u.noAlerts}</p>
      {country === "BR" && (
        <section className="text-xs text-ink-3">
          {u.sources.replace("{d}", e.checkedOn)}
          <ul className="mt-1 list-disc pl-5">
            {e.sources.map((s) => <li key={s.url}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
