"use client";
import { Accessibility, Bell, Flame, Menu, Phone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, prefs, setPrefs, offline, meta, filters, setFilters } = useApp();
  const c = t.copy;
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [a11y, setA11y] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-brand focus:p-2 focus:text-brand-ink">{c.skipLink}</a>
      <header className="sticky top-0 z-[1500] bg-header text-header-ink shadow-md">
        <div className="flex items-center gap-3 px-3 py-2 lg:px-5">
          <button className="press rounded p-2 xl:hidden" aria-label={c.header.menu} onClick={() => setMenu((v) => !v)}>
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-wide">
            <Flame className="text-fire" size={22} aria-hidden /> {c.brand}
          </Link>
          <nav aria-label={c.header.menu} className="ml-4 hidden gap-1 whitespace-nowrap xl:flex">
            {c.nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}
                className={cn("press rounded-md px-3 py-1.5 text-sm hover:bg-white/10", path === n.href && "bg-white/15 font-semibold")}>
                {n.label}
              </Link>
            ))}
            <Link href="/professores" aria-current={path === "/professores" ? "page" : undefined}
              className={cn("press rounded-md px-3 py-1.5 text-sm hover:bg-white/10", path === "/professores" && "bg-white/15 font-semibold")}>
              For teachers
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/urgencia" className="press hidden items-center gap-1.5 whitespace-nowrap rounded-md bg-fire px-3 py-1.5 text-sm font-semibold text-fire-ink sm:flex">
              <Phone size={15} aria-hidden /> {c.header.urgencia}
            </Link>
            <Link href="/alertas" className="press hidden items-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink md:flex">
              <Bell size={15} aria-hidden /> {c.header.alertas}
            </Link>
            <Link href="/bombeiros" className="press hidden whitespace-nowrap rounded-md border border-white/40 px-3 py-1.5 text-sm lg:block">{c.header.brigada}</Link>
            <button onClick={() => setA11y((v) => !v)} className="press rounded-md p-2 hover:bg-white/10" aria-label={c.header.acessibilidade}><Accessibility size={18} /></button>
          </div>
        </div>
        {menu && (
          <nav className="fade-in border-t border-white/20 px-3 py-2 xl:hidden">
            {c.nav.map((n) => <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="block rounded px-3 py-2 hover:bg-white/10">{n.label}</Link>)}
            <Link href="/professores" onClick={() => setMenu(false)} className="block rounded px-3 py-2">For teachers</Link>
            <Link href="/urgencia" onClick={() => setMenu(false)} className="block rounded px-3 py-2 text-fire">{c.header.urgencia}</Link>
            <Link href="/alertas" onClick={() => setMenu(false)} className="block rounded px-3 py-2">{c.header.alertas}</Link>
            <Link href="/bombeiros" onClick={() => setMenu(false)} className="block rounded px-3 py-2">{c.header.brigada}</Link>
          </nav>
        )}
        {a11y && (
          <div className="pop-in absolute right-3 top-full z-50 mt-1 w-72 rounded-xl border border-line bg-panel p-4 text-ink shadow-xl" role="dialog" aria-label={c.a11y.title}>
            <h2 className="mb-3 font-display font-semibold">{c.a11y.title}</h2>
            <div className="mb-3 flex items-center justify-between text-sm">
              {c.a11y.textSize}
              <span className="flex gap-1">
                <button className="press rounded border border-line px-2" aria-label={c.a11y.smaller} onClick={() => setPrefs({ scale: Math.max(0.85, +(prefs.scale - 0.1).toFixed(2)) })}>A−</button>
                <button className="press rounded border border-line px-2" aria-label={c.a11y.larger} onClick={() => setPrefs({ scale: Math.min(1.4, +(prefs.scale + 0.1).toFixed(2)) })}>A+</button>
              </span>
            </div>
            {([["hc", c.a11y.highContrast], ["colorblind", c.a11y.colorblind], ["reduceMotion", c.a11y.reduceMotion]] as const).map(([k, label]) => (
              <label key={k} className="mb-2 flex cursor-pointer items-center justify-between text-sm">
                {label}
                <input type="checkbox" checked={prefs[k]} onChange={(e) => setPrefs({ [k]: e.target.checked })} className="size-4 accent-[var(--brand)]" />
              </label>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-1">
        <main id="main" className="min-w-0 flex-1 p-3 lg:p-5">
          {["/calendario", "/harmonizacao", "/dados", "/previsao"].some((p) => path.startsWith(p)) && !!filters.region && (
            <label className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-ink-3">Region</span>
              <select className="input w-auto" value={filters.region} onChange={(e) => setFilters({ region: e.target.value, bbox: null })}>
                <option value="">Change region…</option>
                {(meta?.regions ?? []).filter((r) => !r.key.startsWith("sample") && true).map((r) => <option key={r.key} value={r.key}>{(r.name_en || r.name) + (r.data_start || path.startsWith("/previsao") ? "" : ` — series processing${r.progress ? " " + Math.round(r.progress * 100) + "%" : ""}`)}</option>)}
              </select>
            </label>
          )}
          {children}
        </main>
      </div>

      <footer className="border-t border-line px-4 py-2 text-xs text-ink-3">
        {offline && <span className="mr-2 rounded bg-fire px-1.5 text-fire-ink">{c.status.offline}</span>}
        {c.status.credit}{" "}
        <Link href="/professores" className="underline">For teachers</Link> · <Link href="/sobre" className="underline">{c.status.about}</Link>
      </footer>
    </div>
  );
}
