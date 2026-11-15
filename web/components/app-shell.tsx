"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Accessibility, AlertTriangle, ArrowRight, Flame, Info, LogIn, Menu, Search, SlidersHorizontal, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copy } from "@/content/copy";
import { PALETTES, classColors, type PaletteId } from "@/lib/palettes";
import { FONT_STEPS } from "@/lib/prefs";
import { brDate } from "@/lib/format";
import {
  FRP_CLASSES, PERIOD_IDS, filterRange, granularity, type CategoryFilter, type FrpClass, type PeriodId, type Sensor,
} from "@/lib/filters";
import { parseLatLon, requestFlyTo } from "@/lib/map-bus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useAppState } from "./app-state";
import { LearnSheet } from "./learn-sheet";

const C = copy;
const S = copy.sidebar;
// 44 px touch targets on coarse pointers; compact on mouse (matches the design density).
const touch = "pointer-coarse:min-h-11";
const field = cn("w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground", touch);
const label = "block text-sm font-medium";
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// ------------------------------------------------------------------ header
function NavLinks({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  const path = usePathname();
  const { hrefWith } = useAppState();
  return (
    <ul className={cn("flex gap-1", vertical ? "flex-col" : "items-center")}>
      {C.nav.map((n) => {
        const active = path === n.href;
        return (
          <li key={n.href}>
            <Link href={hrefWith(n.href)} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("block rounded-md px-3 py-1.5 text-sm font-medium", touch, ring,
                vertical ? "text-foreground hover:bg-accent" : "text-white/85 hover:bg-white/10 hover:text-white",
                active && (vertical ? "bg-accent" : "bg-white/10 text-white underline decoration-brand decoration-2 underline-offset-8"))}>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function A11yPopover() {
  const { prefs, setPrefs, filters, setFilters } = useAppState();
  return (
    <Popover>
      <PopoverTrigger aria-label={C.header.acessibilidade} title={C.header.acessibilidade}
        className={cn("grid size-9 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20", touch, ring)}>
        <Accessibility className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <p className="font-heading text-sm font-semibold">{C.a11y.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">{C.a11y.textSize}</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={C.a11y.smaller} disabled={prefs.fontStep === 0}
              onClick={() => setPrefs({ fontStep: prefs.fontStep - 1 })}
              className={cn("rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent disabled:opacity-40", touch, ring)}>A−</button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{Math.round(FONT_STEPS[prefs.fontStep] * 100)}%</span>
            <button type="button" aria-label={C.a11y.larger} disabled={prefs.fontStep === FONT_STEPS.length - 1}
              onClick={() => setPrefs({ fontStep: prefs.fontStep + 1 })}
              className={cn("rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent disabled:opacity-40", touch, ring)}>A+</button>
          </div>
        </div>
        <SwitchRow label={C.a11y.highContrast} checked={prefs.highContrast} onChange={(v) => setPrefs({ highContrast: v })} />
        <SwitchRow label={C.a11y.colorblind} hint={C.a11y.colorblindHint} checked={filters.palette === "cividis"}
          onChange={(v) => setFilters({ palette: v ? "cividis" : "inferno" })} />
        <SwitchRow label={C.a11y.reduceMotion} checked={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
      </PopoverContent>
    </Popover>
  );
}

function SwitchRow({ label: l, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("flex items-center justify-between gap-3 text-sm", touch)}>
      <span>{l}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function LoginDialog() {
  return (
    <Dialog>
      <DialogTrigger className={cn("flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-header hover:bg-white/90", touch, ring)}>
        <LogIn className="size-4" aria-hidden /> <span className="hidden sm:inline">{C.header.entrar}</span>
        <span className="sr-only sm:hidden">{C.header.entrar}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading">{C.header.loginTitle}</DialogTitle>
        <DialogDescription>{C.header.loginBody}</DialogDescription>
        <p className="text-xs text-muted-foreground">{C.header.loginNote}</p>
      </DialogContent>
    </Dialog>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="bg-header text-white">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4">
        <Link href="/" className={cn("flex items-center gap-2 rounded-md font-heading font-bold tracking-wide", ring)}>
          <span className="grid size-7 place-items-center rounded-md bg-white text-header"><Flame className="size-4" aria-hidden /></span>
          <span className="text-sm uppercase max-[420px]:sr-only">{C.brand}</span>
        </Link>
        <nav aria-label="Principal" className="mx-auto hidden md:block"><NavLinks /></nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger className={cn("flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-sm md:hidden", touch, ring)}>
              <Menu className="size-4" aria-hidden /> {C.header.menu}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-2">
              <nav aria-label="Principal"><NavLinks vertical onNavigate={() => setMenuOpen(false)} /></nav>
            </PopoverContent>
          </Popover>
          <Link href="/urgencia" className={cn("flex items-center gap-1.5 rounded-md bg-fire px-3 py-1.5 text-sm font-semibold text-black hover:brightness-110", touch, ring)}>
            <AlertTriangle className="size-4" aria-hidden /> {C.header.urgencia}
          </Link>
          <A11yPopover />
          <LoginDialog />
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ sidebar
function SearchBox() {
  const { meta, setFilters, hrefWith } = useAppState();
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const ll = parseLatLon(text);
    if (ll) {
      requestFlyTo({ ...ll, label: text });
      setMsg("");
      if (path !== "/") router.push(hrefWith("/"));
      return;
    }
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const r = meta?.regions.find((x) => norm(x.name).includes(norm(text)) || norm(x.key) === norm(text));
    if (r) { setFilters({ region: r.key, area: null, cell: null }); setMsg(""); return; }
    setMsg(S.searchNotFound);
  }
  return (
    <form role="search" onSubmit={submit} className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={S.search} aria-label={S.search}
          aria-describedby="search-hint" className={cn(field, "pl-8 pr-8")} />
        {q && (
          <button type="button" onClick={() => { setQ(""); setMsg(""); }} aria-label={S.searchClear}
            className={cn("absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground", ring)}>
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <p id="search-hint" className="sr-only">{S.searchHint}</p>
      <p aria-live="polite" className="text-xs text-fire">{msg}</p>
    </form>
  );
}

function Segmented<T extends string>({ value, options, onChange, name }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex rounded-lg border border-input bg-background p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={cn("flex-1 rounded-md px-2 py-1 text-xs font-medium", touch, ring,
            value === o.id ? "bg-brand text-black" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PeriodControls() {
  const { filters, setFilters, region, meta } = useAppState();
  const lo = region?.data_start ?? undefined, hi = region?.data_end ?? undefined;
  const r = filterRange(filters, hi);
  const shown = { start: r.start ?? lo ?? "", end: r.end ?? hi ?? "" };
  const [pending, setPending] = useState<{ start: string; end: string } | null>(null);
  const v = pending ?? shown;
  const invalid = !!pending;
  function change(next: { start: string; end: string }) {
    const ok = !!next.start && !!next.end && next.start <= next.end && (!lo || next.start >= lo) && (!hi || next.end <= hi);
    if (ok) { setPending(null); setFilters({ period: "custom", start: next.start, end: next.end }); }
    else setPending(next);
  }
  const gran = granularity(v.start || undefined, meta?.daily_window_start);
  return (
    <div className="space-y-2">
      <label className={label}>
        <span className="mb-1 flex items-center justify-between">
          {S.period}
          <span title={S.granularityTitle} className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
            gran === "Diário" ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground")}>{gran}</span>
        </span>
        <select className={field} value={filters.period} onChange={(e) => { setPending(null); setFilters({ period: e.target.value as PeriodId, start: null, end: null }); }}>
          {PERIOD_IDS.map((p) => <option key={p} value={p} disabled={p === "custom" && filters.period !== "custom"}>{S.periods[p]}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">{S.from}
          <input type="date" className={cn(field, "mt-0.5 px-1.5 text-xs")} value={v.start} min={lo} max={hi} aria-invalid={invalid}
            onChange={(e) => change({ ...v, start: e.target.value })} />
        </label>
        <label className="text-xs text-muted-foreground">{S.to}
          <input type="date" className={cn(field, "mt-0.5 px-1.5 text-xs")} value={v.end} min={lo} max={hi} aria-invalid={invalid}
            onChange={(e) => change({ ...v, end: e.target.value })} />
        </label>
      </div>
      {invalid && <p role="alert" className="text-xs text-fire">{S.dateError} {brDate(lo)}–{brDate(hi)}.</p>}
    </div>
  );
}

function FrpChips() {
  const { filters, setFilters } = useAppState();
  const all = filters.frp.length === 0;
  function toggle(c: FrpClass) {
    const set = new Set(all ? [] : filters.frp);
    if (set.has(c)) set.delete(c); else set.add(c);
    const next = FRP_CLASSES.filter((x) => set.has(x));
    setFilters({ frp: next.length === FRP_CLASSES.length ? [] : next });
  }
  const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-xs", touch, ring,
    on ? "border-brand bg-brand/15 text-brand" : "border-input text-muted-foreground hover:text-foreground");
  return (
    <fieldset className="space-y-1.5">
      <legend className={label}>{S.frp}</legend>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={all} onClick={() => setFilters({ frp: [] })} className={chip(all)}>{S.frpAll}</button>
        {FRP_CLASSES.map((c) => (
          <button key={c} type="button" aria-pressed={!all && filters.frp.includes(c)} onClick={() => toggle(c)} className={chip(!all && filters.frp.includes(c))}>
            {S.frpClasses[c]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{S.frpNote}</p>
    </fieldset>
  );
}

function ColorControls() {
  const s = useAppState();
  const sw = classColors(s.palette, s.classes, s.invert);
  return (
    <div className="space-y-2">
      <label className={label}>
        <span className="mb-1 block">{S.colors}</span>
        <select className={field} value={s.filters.palette} disabled={s.prefs.highContrast}
          onChange={(e) => s.setFilters({ palette: e.target.value as PaletteId })}>
          {(Object.keys(PALETTES) as PaletteId[]).map((p) => <option key={p} value={p}>{PALETTES[p].label}</option>)}
        </select>
      </label>
      <div className="flex h-2.5 overflow-hidden rounded" aria-hidden>{sw.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</div>
      <SwitchRow label={S.invert} checked={s.invert} onChange={(v) => s.setFilters({ invert: v })} />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm"><span id="classes-label">{S.classes}</span><span className="tabular-nums text-muted-foreground">{s.classes}</span></div>
        <Slider min={4} max={9} step={1} value={[s.classes]} aria-labelledby="classes-label"
          onValueChange={(v) => s.setFilters({ classes: Array.isArray(v) ? v[0] : (v as number) })} />
      </div>
    </div>
  );
}

function GuideSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <UsefulItem onClick={() => setOpen(true)}>{S.howToRead}</UsefulItem>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-heading">{C.guide.title}</SheetTitle>
            <SheetDescription>{C.guide.intro}</SheetDescription>
          </SheetHeader>
          <ol className="list-decimal space-y-3 px-8 pb-6 text-sm leading-relaxed">
            {C.guide.tips.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}

function UsefulItem({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = cn("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent", touch, ring);
  const inner = <>{children} <ArrowRight className="size-3.5 text-brand" aria-hidden /></>;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function SidebarContent() {
  const s = useAppState();
  const router = useRouter();
  const path = usePathname();
  const f = s.filters;
  const learnView = { "/": "mapa", "/calendario": "calendario", "/harmonizacao": "harmonizacao", "/previsao": "previsao" }[path || "/"];
  const delim = f.area ? (f.area.startsWith("poly:") ? S.delimCustomPoly : S.delimCustomBbox) : S.delimBbox;
  return (
    <div className="flex flex-col gap-5">
      <SearchBox />
      <section className="space-y-4" aria-labelledby="filters-h">
        <h2 id="filters-h" className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">{S.filtersTitle}</h2>
        <div>
          <label className={label}>
            <span className="mb-1 block">{S.region}</span>
            <div className="flex gap-1.5">
              <select className={field} value={f.area ? "__area" : (s.region?.key ?? "")}
                onChange={(e) => { if (e.target.value !== "__area") s.setFilters({ region: e.target.value, area: null, cell: null }); }}>
                {s.meta?.regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                {f.area && <option value="__area">{S.customArea}</option>}
              </select>
              {f.area && (
                <button type="button" onClick={() => s.setFilters({ area: null })} aria-label={S.clearArea} title={S.clearArea}
                  className={cn("grid w-9 shrink-0 place-items-center rounded-lg border border-input hover:bg-accent", touch, ring)}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </label>
          <p className="mt-1 text-xs text-muted-foreground">{delim}{f.area ? ` · ${s.region?.name ?? ""}` : ""}</p>
        </div>
        <PeriodControls />
        <div className="space-y-1">
          <span className={label} id="sensor-label">{S.sensor}</span>
          <Segmented name={S.sensor} value={f.sensor} onChange={(v: Sensor) => s.setFilters({ sensor: v })}
            options={(Object.keys(S.sensors) as Sensor[]).map((id) => ({ id, label: S.sensors[id] }))} />
        </div>
        <label className={label}>
          <span className="mb-1 flex items-center gap-1">
            {S.category}
            <Popover>
              <PopoverTrigger aria-label={S.categoryInfo} className={cn("grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground", ring)}>
                <Info className="size-3.5" aria-hidden />
              </PopoverTrigger>
              <PopoverContent side="right" className="w-64 text-xs leading-relaxed">{S.categoryInfo}</PopoverContent>
            </Popover>
          </span>
          <select className={field} value={f.category} onChange={(e) => s.setFilters({ category: e.target.value as CategoryFilter })}>
            {(Object.keys(S.categories) as CategoryFilter[]).map((c) => <option key={c} value={c}>{S.categories[c]}</option>)}
          </select>
        </label>
        <FrpChips />
        <ColorControls />
        <button type="button" onClick={s.resetFilters}
          className={cn("w-full rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent", touch, ring)}>{S.clear}</button>
      </section>
      <section className="space-y-1" aria-labelledby="useful-h">
        <h2 id="useful-h" className="pb-1 text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">{S.usefulTitle}</h2>
        <UsefulItem onClick={() => router.push(s.hrefWith("/", { period: "1d", start: null, end: null, layer: "focos" }))}>{S.last24h}</UsefulItem>
        <GuideSheet />
        {learnView && <LearnSheet view={learnView} />}
        <UsefulItem href="/urgencia">{S.alerts}</UsefulItem>
      </section>
      {s.meta?.regions.find((r) => r.key === s.region?.key && r.name.toLowerCase().includes("sintética")) && (
        <p className="rounded-md border border-fire/50 bg-fire/10 p-2 text-xs text-fire">{S.synthetic}</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ status bar
function StatusBar() {
  const s = useAppState();
  const cached = Object.values(s.sources).includes("cache");
  const fin = s.meta?.last_etl_run?.finished_at as string | undefined;
  const d = fin ? new Date(fin.replace(" ", "T")) : null;
  const hhmm = d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const day = d && !Number.isNaN(d.getTime()) ? brDate(d.toLocaleDateString("sv-SE")) : null;
  const btn = cn("rounded border border-border px-2 py-1 hover:bg-accent", touch, ring);
  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", cached ? "bg-fire" : "bg-brand")} aria-hidden />
        {cached ? C.status.offline : hhmm ? `${C.status.updated} ${hhmm} ${C.status.updatedOn} ${day}` : "—"} · {C.status.sensors}
      </span>
      {s.metaError && (
        <span className="flex items-center gap-2 text-fire">{C.status.apiDown}
          <button type="button" onClick={s.retryMeta} className={cn(btn, "text-foreground")}>{C.states.retry}</button>
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn} disabled={s.prefs.fontStep === 0} onClick={() => s.setPrefs({ fontStep: s.prefs.fontStep - 1 })} aria-label={C.a11y.smaller}>A−</button>
        <button type="button" className={btn} disabled={s.prefs.fontStep === FONT_STEPS.length - 1} onClick={() => s.setPrefs({ fontStep: s.prefs.fontStep + 1 })} aria-label={C.a11y.larger}>A+</button>
        <button type="button" className={cn(btn, s.prefs.highContrast && "bg-white text-black")} aria-pressed={s.prefs.highContrast}
          onClick={() => s.setPrefs({ highContrast: !s.prefs.highContrast })}>{C.a11y.highContrast}</button>
        <Link href="/sobre" className={cn("pl-2 underline-offset-2 hover:underline", ring)}>{C.status.about}</Link>
        <a href={C.status.creditUrl} target="_blank" rel="noreferrer" className={cn("pl-2 underline-offset-2 hover:underline", ring)} title={C.status.credit}>
          <span className="hidden xl:inline">{C.status.credit}</span><span className="xl:hidden">{C.status.creditShort}</span>
        </a>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------ shell
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[1000] focus:rounded focus:bg-brand focus:px-3 focus:py-1 focus:text-black">{C.skipLink}</a>
      <Header />
      <div className="flex flex-1">
        <aside className="hidden w-[260px] shrink-0 border-r border-border p-4 lg:block" aria-label={S.filtersTitle}>
          <SidebarContent />
        </aside>
        <main id="conteudo" className="min-w-0 flex-1 p-3 sm:p-4">
          <button type="button" onClick={() => setDrawer(true)}
            className={cn("mb-3 flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm lg:hidden", touch, ring)}>
            <SlidersHorizontal className="size-4" aria-hidden /> {S.filtersButton}
          </button>
          {children}
        </main>
      </div>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-4 lg:hidden">
          <SheetTitle className="sr-only">{S.filtersTitle}</SheetTitle>
          <SidebarContent />
        </SheetContent>
      </Sheet>
      <StatusBar />
    </div>
  );
}

/** Static fallback while the URL state hydrates (useSearchParams needs a Suspense boundary). */
export function ShellFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-header px-4 py-2 text-white">
        <span className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
          <span className="grid size-7 place-items-center rounded-md bg-white text-header"><Flame className="size-4" aria-hidden /></span>{C.brand}
        </span>
      </header>
      <div className="flex-1 animate-pulse p-4"><div className="h-24 rounded-xl bg-panel" /></div>
    </div>
  );
}
