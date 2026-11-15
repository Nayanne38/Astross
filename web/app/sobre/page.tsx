"use client";
import { useApp } from "@/components/app-state";
import { State } from "@/components/panel";
import { useQ } from "@/lib/use-q";
import type { GlossaryTerm, HarmonizationResponse } from "@/lib/types";

export default function Page() {
  const { t, filters } = useApp();
  const s = t.sobre;
  const gl = useQ<GlossaryTerm[]>("/glossary", { nivel: "estudante" });
  const h = useQ<HarmonizationResponse>("/harmonization", { region: filters.region, learn: false });
  const H2 = "font-display text-xl font-semibold";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-bold">{s.title}</h1>
      <p className="text-lg text-ink-2">{s.lead}</p>
      <section>
        <h2 className={H2}>{s.sourcesTitle}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {s.sources.map((x) => <li key={x.name}><a className="text-brand underline" href={x.url} target="_blank" rel="noreferrer">{x.name}</a></li>)}
        </ul>
      </section>
      <section><h2 className={H2}>{s.ackTitle}</h2><p className="mt-2 text-ink-2">{s.ack}</p></section>
      <section>
        <h2 className={H2}>{s.limitsTitle}</h2>
        <State q={h}><ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{(h.data?.limitations ?? []).map((x) => <li key={x}>{x}</li>)}</ul></State>
      </section>
      <section>
        <h2 className={H2}>{s.glossaryTitle}</h2>
        <State q={gl}>
          <dl className="mt-2 space-y-3">
            {(gl.data ?? []).map((g) => (
              <div key={g.id}>
                <dt className="font-semibold">{g.termo}</dt>
                <dd className="text-ink-2">{g.definicao}<br /><span className="text-fire">{s.glossaryPitfall}</span> {g.armadilha}</dd>
              </div>
            ))}
          </dl>
        </State>
      </section>
      <section><h2 className={H2}>{s.creditsTitle}</h2><ul className="mt-2 list-disc pl-5 text-ink-2">{s.credits.map((x) => <li key={x}>{x}</li>)}</ul></section>
      <section><h2 className={H2}>{s.teamTitle}</h2><p className="text-ink-2">{s.team}</p></section>
      <section><h2 className={H2}>{s.licenseTitle}</h2><p className="text-ink-2">{s.license}</p></section>
      <p className="text-xs text-ink-3">Technical detail and development critiques: docs/APRESENTACAO.md.</p>
    </div>
  );
}
