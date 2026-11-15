"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PinMap from "@/components/PinMap";
import QrCode from "@/components/QrCode";
import { cn } from "@/lib/utils";
import { COUNTRIES, DIAL, e164 } from "@/lib/countries";
import { useApp } from "@/components/app-state";
import {
  type AlertsConfig, type GeocodeHit, type RecipientKind, type Registration, alertsApi, telegramHtml,
} from "@/lib/alerts";

type Step = "start" | "form" | "connect";
const STORE_KEY = "astross.alert.token";

function save(token: string | null) {
  try { if (token) localStorage.setItem(STORE_KEY, token); else localStorage.removeItem(STORE_KEY); } catch { /* private mode */ }
}
function load(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export default function AlertFlow({ initialKind }: { initialKind?: RecipientKind }) {
  const [step, setStep] = useState<Step>(initialKind ? "form" : "start");
  const [kind, setKind] = useState<RecipientKind>(initialKind ?? "cidadao");
  const [cfg, setCfg] = useState<AlertsConfig | null>(null);
  const [reg, setReg] = useState<Registration | null>(null);

  useEffect(() => {
    alertsApi<AlertsConfig>("/alerts/config").then(setCfg).catch(() => setCfg(null));
    const t = load();
    if (t) alertsApi<Registration>(`/alerts/registration/${t}`)
      .then((r) => { if (!initialKind || r.kind === initialKind) { setReg(r); setKind(r.kind); setStep("connect"); } })
      .catch(() => save(null));
  }, [initialKind]);

  const done = (r: Registration) => { setReg(r); save(r.link_token); setStep("connect"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  const restart = () => { save(null); setReg(null); setStep(initialKind ? "form" : "start"); };

  const at = step === "connect" ? (reg?.connected ? 2 : 1) : 0;
  return (
    <div className="mx-auto w-full max-w-md">
      <Stepper at={at} bombeiro={kind === "bombeiro"} />
      <div key={step + (reg?.connected ? "-ok" : "")} className="step-in">
      {step === "start" && <Start onPick={(k) => { setKind(k); setStep("form"); }} radius={cfg?.citizen_radius_km ?? 10} />}
      {step === "form" && (
        <>
          <button className="mb-3 text-sm text-muted hover:text-fg" onClick={() => setStep("start")}>← back</button>
          {kind === "cidadao" ? <CitizenForm onDone={done} radius={cfg?.citizen_radius_km ?? 10} /> : <FirefighterForm onDone={done} />}
        </>
      )}
      {step === "connect" && reg && <Connect reg={reg} setReg={setReg} botEnabled={cfg?.bot_enabled ?? !!reg.telegram_link} onRestart={restart} />}
      </div>
    </div>
  );
}

/* ---------- progress: 3 steps, rail scales on the GPU ---------- */

function Stepper({ at, bombeiro }: { at: number; bombeiro: boolean }) {
  const labels = ["Sign up", "Telegram", "Done"];
  return (
    <ol className="mb-5 mt-1" aria-label={bombeiro ? "Firefighter sign-up steps" : "Sign-up steps"}>
      <div className="relative mb-2 h-1 overflow-hidden rounded-full bg-panel-2" aria-hidden>
        <div className="rail absolute inset-0 rounded-full bg-fire" style={{ transform: `scaleX(${(at + 1) / 3})` }} />
      </div>
      <div className="grid grid-cols-3 text-xs">
        {labels.map((l, i) => (
          <li key={l} aria-current={i === at ? "step" : undefined}
            className={cn("transition-colors duration-200", i === 0 ? "text-left" : i === 2 ? "text-right" : "text-center", i <= at ? "font-semibold text-fg" : "text-muted")}>
            <span className={cn("mr-1 inline-grid size-4 place-items-center rounded-full text-[10px]", i < at ? "bg-ok text-black" : i === at ? "bg-fire text-black" : "bg-panel-2")}>{i < at ? "✓" : i + 1}</span>{l}
          </li>
        ))}
      </div>
    </ol>
  );
}

/* ---------- step 0: the big button ---------- */

function Start({ onPick, radius }: { onPick: (k: RecipientKind) => void; radius: number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6 mt-4 grid h-28 w-28 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-fire/20 [animation-duration:2.4s] motion-reduce:hidden" aria-hidden />
        <span className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-fire-2 to-fire text-5xl shadow-[0_0_40px_#ff7a2f55]">🔥</span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Fire alerts near you</h1>
      <p className="mt-2 text-sm text-muted">
        NASA satellites detect heat hotspots several times a day. We message you on Telegram when a
        hotspot appears within <b className="text-fg">{radius} km</b> of your address.
      </p>
      <button onClick={() => onPick("cidadao")}
        className="press mt-7 w-full rounded-2xl bg-fire px-6 py-5 text-lg font-bold text-black shadow-[0_8px_30px_#ff7a2f40] hover:brightness-110">
        🔔 I want to receive fire alerts
      </button>
      <button onClick={() => onPick("bombeiro")} className="btn-ghost mt-3 w-full justify-center py-3">
        🚒 I&apos;m a firefighter — alerts for my city
      </button>
      
    </div>
  );
}

/* ---------- shared bits ---------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** International phone: country (dial code) + national number. Sent as E.164, e.g. +5579999990000. */
function PhoneField({ cc, setCc, value, onChange }: { cc: string; setCc: (c: string) => void; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Phone (WhatsApp/Telegram)" hint="Choose your country, then type your number. It is stored in international format.">
      <div className="grid grid-cols-[9.5rem_1fr] gap-2">
        <select className="input" aria-label="Country calling code" value={cc} onChange={(e) => setCc(e.target.value)}>
          <option value="">Country…</option>
          {COUNTRIES.map((c) => <option key={c.cc} value={c.cc}>{c.name} (+{c.dial})</option>)}
        </select>
        <input className="input" inputMode="tel" autoComplete="tel-national" required value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d\s().+-]/g, ""))} placeholder="79 99999-0000" />
      </div>
    </Field>
  );
}

function Consent({ checked, onChange, kind }: { checked: boolean; onChange: (v: boolean) => void; kind: RecipientKind }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--fire)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I allow FIRETRACK to store this data <b className="text-fg">only to send fire alerts</b>
        {kind === "cidadao" ? " near the address I provided" : " for my area of operation"}. I can cancel and delete everything at any
        time by sending <b className="text-fg">/stop</b> to the bot.
      </span>
    </label>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="step-in rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{msg}</p> : null;
}

/* ---------- step 1a: citizen ---------- */

function CitizenForm({ onDone, radius }: { onDone: (r: Registration) => void; radius: number }) {
  const [name, setName] = useState("");
  const { country } = useApp();
  const [phone, setPhone] = useState("");
  const [pcc, setPcc] = useState(country && DIAL[country] ? country : "");
  const [age, setAge] = useState("");
  const [address, setAddress] = useState("");
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const minor = age !== "" && Number(age) < 18;
  const revSeq = useRef(0);

  const search = async () => {
    setErr(null); setHits(null);
    if (address.trim().length < 4) return setErr("Enter street, number, neighborhood and city.");
    setBusy("Searching for address…");
    try {
      const r = await alertsApi<GeocodeHit[]>(`/alerts/geocode?q=${encodeURIComponent(address.trim())}`);
      setHits(r);
      if (r.length === 1) choose(r[0]);
      if (!r.length) setErr("Address not found. Try just the neighborhood and city, or use your current location.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  const choose = (h: GeocodeHit) => { setPos({ lat: h.lat, lon: h.lon }); setPlace(h.label); setHits(null); };

  const move = useCallback((lat: number, lon: number) => {
    setPos({ lat, lon });
    const seq = ++revSeq.current;
    alertsApi<{ label: string }>(`/alerts/reverse?lat=${lat}&lon=${lon}`)
      .then((r) => { if (seq === revSeq.current) setPlace(r.label); }).catch(() => {});
  }, []);

  const locate = () => {
    setErr(null);
    if (!navigator.geolocation) return setErr("Your browser does not provide your location.");
    setBusy("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(null); move(p.coords.latitude, p.coords.longitude); },
      () => { setBusy(null); setErr("Could not get your location. Type the address."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!pcc) return setErr("Choose the country of your phone number.");
    if (!pos) return setErr("Confirm the location on the map (search the address or use your location).");
    if (!consent) return setErr("Check the data-use authorization.");
    if (minor && !guardian) return setErr("Under-18s need a guardian's authorization.");
    setBusy("Registering…");
    try {
      onDone(await alertsApi<Registration>("/alerts/citizens", {
        json: { full_name: name, phone: e164(DIAL[pcc] ?? "", phone), age: Number(age), address: address || place, lat: pos.lat, lon: pos.lon, consent, guardian_consent: guardian },
      }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4">
      <div>
        <p className="kicker">Sign-up · resident</p>
        <h2 className="mt-1 text-xl font-bold">Get alerts near home</h2>
      </div>
      <Field label="Full name"><input className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" /></Field>
      <PhoneField cc={pcc} setCc={setPcc} value={phone} onChange={setPhone} />
      <Field label="Age"><input className="input w-28" inputMode="numeric" required value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="34" /></Field>
      <Field label="Address" hint="Street, number, neighborhood and city. Then check the pin on the map — drag or tap to adjust.">
        <div className="flex gap-2">
          <input className="input" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder="Av. Beira Mar, 1000, Atalaia, Aracaju" />
          <button type="button" className="btn-ghost shrink-0" onClick={search}>Search</button>
        </div>
      </Field>
      <button type="button" className="-mt-2 self-start text-sm text-fire-2 hover:underline" onClick={locate}>📍 Use my current location</button>
      {hits && hits.length > 1 && (
        <ul className="step-in grid gap-1 rounded-xl border border-line bg-panel-2 p-1 text-sm">
          {hits.map((h, i) => (
            <li key={i}><button type="button" className="press w-full rounded-lg px-3 py-2 text-left hover:bg-panel" onClick={() => choose(h)}>{h.label}</button></li>
          ))}
        </ul>
      )}
      {pos && (
        <div className="step-in grid gap-2">
          <PinMap lat={pos.lat} lon={pos.lon} zoom={11} draggable onMove={move} circleKm={radius} emoji="🏠" height={240} />
          <p className="text-xs text-muted">🏠 {place ?? "…"} · circle = monitored area ({radius} km)</p>
        </div>
      )}
      {minor && (
        <label className="flex items-start gap-3 rounded-xl border border-fire/40 bg-fire/10 p-3 text-xs">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--fire)]" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
          <span>I am under 18 and <b>a guardian authorized</b> this sign-up.</span>
        </label>
      )}
      <Consent checked={consent} onChange={setConsent} kind="cidadao" />
      <ErrorBox msg={err} />
      <button className="btn justify-center py-3 text-base" disabled={!!busy}>{busy ?? "Continue →"}</button>
    </form>
  );
}

/* ---------- step 1b: firefighter ---------- */

function FirefighterForm({ onDone }: { onDone: (r: Registration) => void }) {
  const { country } = useApp();
  const [f, setF] = useState({ full_name: "", phone: "", unit: "", city: "", state: "", country: country ?? "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.country) return setErr("Choose the country where you operate.");
    if (!consent) return setErr("Check the data-use authorization.");
    setBusy(true);
    try { onDone(await alertsApi<Registration>("/alerts/firefighters", { json: { ...f, phone: e164(DIAL[f.country] ?? "", f.phone), consent } })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4">
      <div>
        <p className="kicker">Sign-up · firefighters and brigades</p>
        <h2 className="mt-1 text-xl font-bold">Operational alerts by city or municipality</h2>
        <p className="mt-1 text-sm text-muted">You receive every new hotspot detected inside your registered municipality, with coordinates, time, satellite and a navigation link.</p>
      </div>
      <Field label="Full name"><input className="input" autoComplete="name" required value={f.full_name} onChange={set("full_name")} placeholder="Capt. Alex Morgan" /></Field>
      <Field label="Country of operation">
        <select className="input" required value={f.country} onChange={set("country")}>
          <option value="">Select a country…</option>
          {COUNTRIES.map((c) => <option key={c.cc} value={c.cc}>{c.name}</option>)}
        </select>
      </Field>
      <PhoneField cc={f.country} setCc={(c) => setF({ ...f, country: c })} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      <Field label="Corps / unit"><input className="input" required value={f.unit} onChange={set("unit")} placeholder="Fire department, brigade or civil defense unit" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City / municipality of operation"><input className="input" required value={f.city} onChange={set("city")} placeholder="e.g. Aracaju, Sacramento, Alice Springs" /></Field>
        <Field label="State / province (optional)" hint="Helps to find the right place."><input className="input" value={f.state} onChange={set("state")} placeholder="e.g. Sergipe, California" /></Field>
      </div>
      <Consent checked={consent} onChange={setConsent} kind="bombeiro" />
      <ErrorBox msg={err} />
      <button className="btn justify-center py-3 text-base" disabled={busy}>{busy ? "Locating place…" : "Continue →"}</button>
    </form>
  );
}

/* ---------- step 2: QR code + Telegram ---------- */

function Connect({ reg, setReg, botEnabled, onRestart }: {
  reg: Registration; setReg: (r: Registration) => void; botEnabled: boolean; onRestart: () => void;
}) {
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {          // wait for the person to press "Start" in Telegram
    if (reg.connected || !reg.telegram_link) return;
    const id = setInterval(() => {
      alertsApi<Registration>(`/alerts/registration/${reg.link_token}`).then((r) => { if (r.connected) setReg(r); }).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [reg.connected, reg.link_token, reg.telegram_link, setReg]);

  const test = async () => {
    setBusy(true); setTestMsg(null);
    try { await alertsApi(`/alerts/registration/${reg.link_token}/test`, { method: "POST" }); setTestMsg("Sent! Check Telegram."); }
    catch (e) { setTestMsg((e as Error).message); } finally { setBusy(false); }
  };

  const where = reg.kind === "bombeiro" ? `${reg.city} (${reg.state})` : `${reg.radius_km.toFixed(0)} km from your address`;

  return (
    <div className="grid gap-4">
      {reg.connected ? (
        <div className="card border-ok/40 text-center">
          <div className="settle text-4xl" aria-hidden>✅</div>
          <h2 className="mt-2 text-xl font-bold">All set, {reg.first_name}!</h2>
          <p className="mt-1 text-sm text-muted">Your Telegram is connected. You will be notified about hotspots in <b className="text-fg">{where}</b>.</p>
          <button className="btn mt-4 justify-center" onClick={test} disabled={busy}>{busy ? "Sending…" : "🧪 Send a test alert"}</button>
          {testMsg && <p className="mt-2 text-sm text-muted">{testMsg}</p>}
        </div>
      ) : reg.telegram_link ? (
        <div className="card text-center">
          <p className="kicker">Last step</p>
          <h2 className="mt-1 text-xl font-bold">Connect your Telegram</h2>
          <p className="mt-1 text-sm text-muted">Tap the button and, in Telegram, tap <b className="text-fg">Start</b>. On a computer? Open the QR code below and point your phone camera at it.</p>
          <a href={reg.telegram_link} target="_blank" rel="noreferrer"
            className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] px-5 py-4 text-base font-bold text-white hover:brightness-110">
            ✈️ Open in Telegram
          </a>
          <details className="mt-4 hidden text-left lg:block">
            <summary className="cursor-pointer text-center text-sm text-muted hover:text-fg">On a computer? Show QR code</summary>
            <div className="step-in mt-3 flex justify-center"><QrCode value={reg.telegram_link} size={150} label="QR code to open the alerts bot on Telegram" /></div>
          </details>
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-fire-2 motion-reduce:animate-none" aria-hidden /> <span role="status">Waiting for connection…</span>
          </p>
          <p className="mt-2 text-xs text-muted">This QR is personal: it links your sign-up to your Telegram. Do not share it.</p>
        </div>
      ) : (
        <div className="card border-fire/40">
          <h2 className="text-lg font-bold">Sign-up received, {reg.first_name}</h2>
          <p className="mt-1 text-sm text-muted">
            {botEnabled ? "Could not reach Telegram right now." : "The Telegram bot has not been configured on this server yet (TELEGRAM_BOT_TOKEN)."}{" "}
            See below what the message will look like.
          </p>
        </div>
      )}

      <div className="card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Example of the message you will receive</p>
        <TelegramBubble html={reg.preview_html} />
      </div>

      <button className="text-sm text-muted hover:text-fg" onClick={onRestart}>Sign up someone else</button>
    </div>
  );
}

export function TelegramBubble({ html }: { html: string }) {
  return (
    <div className="rounded-2xl bg-[#17212b] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#8b9ba8]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-fire text-[11px] text-black">🔥</span> FIRETRACK Alerts · bot
      </div>
      <div className="telegram-msg rounded-xl rounded-tl-sm bg-[#182533] px-3 py-2 text-[13px] leading-relaxed text-[#e9eef2]"
        dangerouslySetInnerHTML={{ __html: telegramHtml(html) }} />
    </div>
  );
}
