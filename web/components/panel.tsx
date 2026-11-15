"use client";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { useApp } from "./app-state";

export function Panel({ title, sub, children, png = true }: { title: string; sub?: string; children: React.ReactNode; png?: boolean }) {
  const { t } = useApp();
  const ref = useRef<HTMLElement>(null);
  async function dl() {
    if (!ref.current) return;
    const { toPng } = await import("html-to-image");
    const url = await toPng(ref.current, { backgroundColor: "#111a1e", pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = url; a.download = `firetrack-${title.toLowerCase().replace(/\W+/g, "-")}.png`; a.click();
  }
  return (
    <section ref={ref} className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="mr-auto">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {sub && <p className="text-xs text-ink-3">{sub}</p>}
        </div>
        {png && <button onClick={dl} aria-label={t.copy.ui.pngAria} title={t.copy.ui.png} className="press rounded-md border border-line p-1.5 hover:bg-line"><Download size={15} /></button>}
      </div>
      <div className="fade-in">{children}</div>
    </section>
  );
}

export function State({ q, children }: { q: { isPending: boolean; isError: boolean; refetch: () => void }; children: React.ReactNode }) {
  const { t } = useApp();
  if (q.isPending) return <div className="skeleton h-48 w-full" aria-busy />;
  if (q.isError) return (
    <div role="alert" className="rounded-lg border border-line p-4 text-sm">
      {t.copy.states.error} <button className="press ml-2 underline" onClick={() => q.refetch()}>{t.copy.states.retry}</button>
    </div>
  );
  return <>{children}</>;
}

export function LearnBox({ learn }: { learn?: import("@/lib/types").Learn | null }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  if (!learn) return null;
  const u = t.copy.ui.learn;
  return (
    <div className="mt-3 rounded-lg border border-line bg-panel-2 p-3 text-sm">
      <button className="press font-semibold text-brand" aria-expanded={open} onClick={() => setOpen(!open)}>{u.titles[learn.view as keyof typeof u.titles] ?? u.titles.mapa}</button>
      {open && (
        <div className="fade-in mt-2 space-y-2">
          {learn.cards.map((c) => <div key={c.slot}><div className="text-xs uppercase text-ink-3">{u.slots[c.slot]}</div><b>{c.titulo}</b><p className="text-ink-2">{c.texto}</p></div>)}
          {!!learn.nao_diz.length && <div><div className="text-xs uppercase text-ink-3">{u.naoDiz}</div><ul className="list-disc pl-5 text-ink-2">{learn.nao_diz.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {!!learn.para_pensar.length && <div><div className="text-xs uppercase text-ink-3">{u.think}</div><ul className="list-disc pl-5 text-ink-2">{learn.para_pensar.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {!!learn.ods.length && <p className="text-xs text-ink-3">{u.ods} {learn.ods.map((o) => o.meta).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
