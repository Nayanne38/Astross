"use client";

import { ExternalLink } from "lucide-react";
import { useApi, useAppState } from "@/components/app-state";
import { ErrorBox, Loading, Panel } from "@/components/panel";
import { harm as H, sobre as S } from "@/content/copy";
import type { GlossaryTerm, HarmonizationResponse } from "@/lib/types";

export function AboutView() {
  const { region } = useAppState();
  const lim = useApi<HarmonizationResponse>(region ? "/harmonization" : null, { region: region?.key, learn: false });
  const glo = useApi<GlossaryTerm[]>("/glossary", { nivel: "simples" });
  const link = "inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">{S.title}</h1>
        <p className="text-base leading-relaxed">{S.lead}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={S.sourcesTitle}>
          <ul className="space-y-2 text-sm">
            {S.sources.map((s) => <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer" className={link}>{s.name} <ExternalLink className="size-3" aria-hidden /></a></li>)}
          </ul>
        </Panel>
        <Panel title={S.ackTitle}>
          <p className="text-sm leading-relaxed">{S.ack}</p>
          <p className="mt-2 text-sm"><a href="https://earthdata.nasa.gov/firms" target="_blank" rel="noreferrer" className={link}>earthdata.nasa.gov/firms <ExternalLink className="size-3" aria-hidden /></a></p>
        </Panel>
        <Panel title={S.creditsTitle}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{S.credits.map((c) => <li key={c}>{c}</li>)}</ul>
        </Panel>
        <Panel title={S.licenseTitle}>
          <p className="text-sm leading-relaxed">{S.license}</p>
          <p className="mt-3 text-sm font-medium">{S.teamTitle}</p>
          <p className="text-sm text-muted-foreground">{S.team}</p>
        </Panel>
      </div>

      <Panel title={S.limitsTitle}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          {H.extraLimits.map((l) => <li key={l}>{l}</li>)}
          {lim.data?.limitations_simple.map((l) => <li key={l}>{l}</li>)}
        </ul>
        {lim.error && <div className="mt-2"><ErrorBox error={lim.error} onRetry={lim.refetch} /></div>}
      </Panel>

      <section id="glossario" className="scroll-mt-4 rounded-xl border border-border bg-panel p-4" aria-labelledby="glossario-h">
        <h2 id="glossario-h" className="mb-3 text-base font-semibold">{S.glossaryTitle}</h2>
        {glo.error ? <ErrorBox error={glo.error} onRetry={glo.refetch} /> : !glo.data ? <Loading what="glossário" /> : (
          <dl className="grid gap-3 md:grid-cols-2">
            {glo.data.map((g) => (
              <div key={g.id} id={`termo-${g.id}`} className="rounded-lg border border-border bg-background p-3">
                <dt className="font-heading font-semibold">{g.termo}</dt>
                <dd className="mt-1 text-sm leading-relaxed">{g.simples}</dd>
                {g.armadilha && <dd className="mt-1 text-xs text-muted-foreground"><strong className="text-fire">{S.glossaryPitfall}</strong> {g.armadilha}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
