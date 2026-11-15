"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApi, useAppState } from "./app-state";
import type { Learn } from "@/lib/types";

const ENDPOINT: Record<string, { path: string; title: string }> = {
  mapa: { path: "/hexgrid", title: "Como ler o mapa" },
  calendario: { path: "/calendar", title: "Como ler o calendário" },
  harmonizacao: { path: "/harmonization", title: "Como ler a harmonização" },
  previsao: { path: "/forecast", title: "Como ler a previsão" },
};
const SLOT = { situacao: "O que você vê", cautela: "Cuidado ao concluir", contexto: "Contexto" } as const;
type Nivel = "simples" | "estudante" | "tecnico";

/** Drawer with the deterministic `learn` block the API returns for the current view. */
export function LearnSheet({ view }: { view: string }) {
  const { region, range } = useAppState();
  const [open, setOpen] = useState(false);
  const [nivel, setNivel] = useState<Nivel>("simples");
  const ep = ENDPOINT[view];
  const { data, loading, error } = useApi<{ learn?: Learn | null }>(
    open && region ? ep.path : null,
    { region: region?.key, start: range.start, end: range.end, nivel, boundary: false, limit: 1, fallback: false },
  );
  const L = data?.learn;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
        {ep.title} <ArrowRight className="size-3.5 text-brand" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[28rem] overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{ep.title}</SheetTitle>
            <SheetDescription>Textos gerados a partir dos dados exibidos, sem inteligência artificial.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6 text-sm">
            <div role="radiogroup" aria-label="Nível de linguagem" className="flex gap-1">
              {(["simples", "estudante", "tecnico"] as Nivel[]).map((n) => (
                <button key={n} role="radio" aria-checked={nivel === n} onClick={() => setNivel(n)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${nivel === n ? "border-brand bg-brand text-black" : "border-border"}`}>
                  {n === "tecnico" ? "técnico" : n}
                </button>
              ))}
            </div>
            {loading && <p className="text-muted-foreground">Carregando…</p>}
            {error && <p className="text-fire">Não foi possível carregar a explicação.</p>}
            {L && (
              <>
                {L.avisos.map((a) => <p key={a.codigo} className="rounded-md border border-fire/40 bg-fire/10 p-2 text-xs">{a.texto}</p>)}
                {(["situacao", "cautela", "contexto"] as const).map((slot) => {
                  const cards = L.cards.filter((c) => c.slot === slot);
                  if (!cards.length) return null;
                  return (
                    <section key={slot} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{SLOT[slot]}</h3>
                      {cards.map((c) => <div key={c.id} className="rounded-md bg-muted p-3"><p className="font-medium">{c.titulo}</p><p className="mt-1 leading-relaxed">{c.texto}</p></div>)}
                    </section>
                  );
                })}
                <section className="rounded-md border border-brand/40 p-3">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">O que este dado NÃO diz</h3>
                  <ul className="list-disc space-y-1 pl-4">{L.nao_diz.map((t) => <li key={t}>{t}</li>)}</ul>
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Para pensar</h3>
                  <ul className="list-disc space-y-1 pl-4">{L.perguntas.map((q) => <li key={q.texto}>{q.texto}</li>)}</ul>
                </section>
                <p className="text-xs text-muted-foreground">Metas ODS da ONU: {L.ods.join(", ")}</p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
