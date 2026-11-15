"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETTES, classColors, type PaletteId } from "@/lib/palettes";
import { brDate } from "@/lib/format";
import { PERIODS, useAppState, type PeriodId } from "./app-state";
import { LearnSheet } from "./learn-sheet";

const NAV = [
  { href: "/", label: "Mapa de focos" },
  { href: "/calendario", label: "Calendário" },
  { href: "/dados", label: "Dados completos" },
  { href: "/harmonizacao", label: "Harmonização" },
  { href: "/previsao", label: "Previsão" },
  { href: "/sobre", label: "Sobre / Créditos" },
];

function Header() {
  const path = usePathname();
  return (
    <header className="bg-header text-white">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-wide">
          <span className="grid size-7 place-items-center rounded-md bg-white text-header"><Flame className="size-4" aria-hidden /></span>
          <span className="text-sm uppercase">Calendário de Queimadas</span>
        </Link>
        <nav aria-label="Principal" className="mx-auto flex flex-wrap justify-center gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white",
                path === n.href && "bg-white/10 text-white underline decoration-brand decoration-2 underline-offset-8")}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

const field = "w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand";

function Sidebar() {
  const s = useAppState();
  const path = usePathname();
  const router = useRouter();
  const sw = classColors(s.palette, s.classes, s.invert);
  const learnView = { "/": "mapa", "/calendario": "calendario", "/harmonizacao": "harmonizacao", "/previsao": "previsao" }[path || "/"];
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 border-r border-border p-4" aria-label="Filtros">
      <section className="space-y-3">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">Filtros</h2>
        <label className="block space-y-1 text-sm font-medium">
          <span>Região</span>
          <select className={field} value={s.region?.key || ""} onChange={(e) => s.setRegionKey(e.target.value)}>
            {s.meta?.regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Período</span>
          <select className={field} value={s.period} onChange={(e) => s.setPeriod(e.target.value as PeriodId)}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div className="space-y-1 text-sm font-medium">
          <label htmlFor="palette">Cores</label>
          <div className="flex items-center gap-2">
            <select id="palette" className={field} value={s.palette} disabled={s.highContrast}
              onChange={(e) => s.setPalette(e.target.value as PaletteId)}>
              {(Object.keys(PALETTES) as PaletteId[]).map((p) => <option key={p} value={p}>{PALETTES[p].label}</option>)}
            </select>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded" aria-hidden>{sw.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
          <div className="flex items-center justify-between gap-2 pt-1 text-xs font-normal text-muted-foreground">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={s.invert} onChange={(e) => s.setInvert(e.target.checked)} /> Inverter</label>
            <label className="flex items-center gap-1.5">Classes
              <select className="rounded border border-input bg-background px-1 py-0.5 text-foreground" value={s.classes} onChange={(e) => s.setClasses(Number(e.target.value))}>
                {[3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>
      <section className="space-y-1">
        <h2 className="pb-1 text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">Úteis para todos</h2>
        <button type="button" onClick={() => { s.setPeriodFor("/", "1d"); s.setMapMode("focos"); router.push("/"); }}
          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
          Detecções nas últimas 24 h <ArrowRight className="size-3.5 text-brand" aria-hidden />
        </button>
        {learnView && <LearnSheet view={learnView} />}
        <Link href="/sobre#glossario" className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent">
          Glossário <ArrowRight className="size-3.5 text-brand" aria-hidden />
        </Link>
      </section>
      {s.region && s.meta?.regions && s.region.name.toLowerCase().includes("sintética") && (
        <p className="rounded-md border border-fire/50 bg-fire/10 p-2 text-xs text-fire">Amostra sintética: só para demonstração, não representa queimadas reais.</p>
      )}
    </aside>
  );
}

function Footer() {
  const s = useAppState();
  const cached = Object.values(s.sources).includes("cache");
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", cached ? "bg-fire" : "bg-brand")} aria-hidden />
        {cached ? "Modo offline: dados em cache local" : `Atualizado em ${brDate(s.meta?.last_etl_run?.finished_at)}`} · MODIS + VIIRS
      </span>
      {s.metaError && <span className="text-fire">API indisponível ({s.metaError.slice(0, 80)})</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <button className="rounded border border-border px-2 py-1 hover:bg-accent" onClick={() => s.setFontScale(Math.max(0.85, s.fontScale - 0.1))} aria-label="Diminuir texto">A−</button>
        <button className="rounded border border-border px-2 py-1 hover:bg-accent" onClick={() => s.setFontScale(Math.min(1.5, s.fontScale + 0.1))} aria-label="Aumentar texto">A+</button>
        <button className={cn("rounded border border-border px-2 py-1 hover:bg-accent", s.highContrast && "bg-white text-black")}
          aria-pressed={s.highContrast} onClick={() => s.setHighContrast(!s.highContrast)}>Alto contraste</button>
        <span className="pl-2">Fonte: NASA FIRMS</span>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[1000] focus:rounded focus:bg-brand focus:px-3 focus:py-1 focus:text-black">Pular para o conteúdo</a>
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main id="conteudo" className="min-w-0 flex-1 p-4">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
