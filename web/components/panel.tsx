"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";

/** Bordered panel with a title and a PNG export of its content (F6). */
export function Panel({ title, subtitle, actions, children, className, pngName }: {
  title?: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; pngName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  async function exportPng() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, {
        backgroundColor: "#141d23", pixelRatio: 2, cacheBust: true,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.html2pngIgnore !== undefined),
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pngName || "painel"}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section ref={ref} className={cn("rounded-xl border border-border bg-panel p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1.5" data-html2png-ignore>
            {actions}
            {pngName && (
              <button type="button" onClick={exportPng} disabled={busy} title="Baixar como PNG" aria-label="Baixar painel como PNG"
                className="rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-50"><Download className="size-4" /></button>
            )}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, badge, note, tone }: {
  label: string; value: React.ReactNode; badge?: React.ReactNode; note?: React.ReactNode; tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</span>
        {badge}
      </div>
      {note && <p className="mt-1 text-xs leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand", className)}>{children}</span>;
}

export function Toggle<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-lg bg-background p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium", value === o.id ? "bg-brand text-black" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ what = "dados" }: { what?: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando {what}…</p>;
}
export function ErrorBox({ error }: { error: string }) {
  return <p className="rounded-md border border-fire/50 bg-fire/10 p-3 text-sm text-fire">Não foi possível carregar: {error.slice(0, 200)}</p>;
}
