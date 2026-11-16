"use client";

import { useState } from "react";
import InsightCard from "@/components/InsightCard";
import PosterQr from "@/components/PosterQr";
import WorldMap from "@/components/WorldMap";
import { type Detection, type ForecastResponse, type HexGridResponse, type Meta, apiUrl } from "@/lib/fire-data";
import { useApi } from "@/lib/useApi";

interface Plan { area: string; serie: string; tempo: string; titulo: string; objetivos: string[]; bncc: string[]; passos: string[]; perguntas: string[] }

/** Expected answers, one per discussion question (same order as PLANS[i].perguntas). Short, for the teacher to check against. */
const ANSWERS: string[][] = [
  [
    "Generally, yes. In the Cerrado, fire is concentrated from July to October, in the dry season, with dry vegetation and low humidity. The calendar shows the same dark band every year.",
    "Clearing pasture and cropland, agricultural management and opening new areas. There are also accidental and criminal fires. Fire use can be authorized (management) or illegal.",
    "Not necessarily. The Cerrado evolved with natural fire (lightning) and many species are adapted to it. The problem is fire frequency and intensity outside the natural regime, and illegal fire, which threatens people, wildlife and the climate.",
  ],
  [
    "In a large pixel, a small fire is \"diluted\" by the temperature of its surroundings and does not pass the detection threshold. In a 375 m pixel it takes up a larger fraction and stands out.",
    "You can only compare them if you calibrate one against the other over a period when both measure the same thing. That is what harmonization does with MODIS and VIIRS.",
    "Individual: do not use fire without authorization, dispose of cigarettes and trash properly, report fires. Collective: fire brigades, firebreaks, enforcement, education and early alerts.",
  ],
  [
    "No. It means that in many similar situations, about 60 out of every 100 would have fire. In any single case it may or may not happen. Probability is not certainty.",
    "To find out whether the model really adds something. If it cannot beat a simple guess (persistence or climatology), the added complexity is not justified.",
    "It should have said that the instrument changed in 2012 (VIIRS began to see smaller fires). Adding the two sensors together counts the same fire more than once and creates an artificial jump.",
  ],
];

const LEVELS = ["Elementary/Middle School", "High School"] as const;
const SECTIONS: [string, string][] = [["mapa", "Map"], ["conceitos", "Concepts"], ["planos", "Lesson plans"], ["ia", "AI explanation"], ["escola", "School and community"], ["glossario", "Glossary"]];

const TOPICS = [
  {
    icon: "🛰️", title: "What is a hotspot?",
    body: [
      "Satellites in orbit measure the infrared radiation coming off the Earth's surface. When a spot is much hotter than its surroundings, NASA's algorithm flags it as a \"hotspot\" (active fire).",
      "Note: a hotspot is not the same as a confirmed fire, nor as burned area. A hotspot indicates active fire at the moment the satellite passed over. Clouds and smoke can hide hotspots, and a single large fire can generate several hotspots.",
    ],
  },
  {
    icon: "🔭", title: "MODIS and VIIRS: two different \"eyes\"",
    body: [
      "MODIS (Terra and Aqua satellites, since 2000) sees the Earth in pixels of about 1 km. VIIRS (Suomi NPP, NOAA-20 and NOAA-21, since 2012) uses 375 m pixels and therefore sees much smaller fires.",
      "When VIIRS came into operation, the number of hotspots \"jumped\". Fire did not suddenly increase: the instrument simply started seeing more. It is like swapping a magnifying glass for a microscope.",
    ],
  },
  {
    icon: "⚖️", title: "Why harmonize?",
    body: [
      "To compare 2005 with 2025 we need a single yardstick. In the years when both sensors operated together (2012–2023), we learned, month by month, how to convert MODIS counts to the VIIRS scale (quantile mapping).",
      "With this, the series since 2003 can be read as if VIIRS had always existed, without the artificial step in 2012. The conversion has uncertainty, larger before 2012, and this is stated explicitly on the site.",
    ],
  },
  {
    icon: "⬡", title: "Why hexagons (H3)?",
    body: [
      "We divide the map into hexagons of ~36 km² (H3 system, level 6). We count how many days each hexagon had fire: the fire cell-days. This avoids counting the same fire several times when multiple satellites pass on the same day.",
      "Hexagons have the same distance from the center to all neighbors, which makes it easier to compare areas and calculate \"the fire around.\"",
    ],
  },
  {
    icon: "📅", title: "How to read the calendar",
    body: [
      "Each row is a year and each column is a month. Dark colors indicate a lot of fire. In the Cerrado, the dark band between July and October is the dry season, and it repeats every year.",
      "Challenge for the class: find an unusual year. What could explain it? Think about drought, El Niño, deforestation or enforcement policies.",
    ],
  },
  {
    icon: "🤖", title: "Forecasting and artificial intelligence",
    body: [
      "A statistical model learns patterns from the past (where it burned recently, in neighboring cells and in the same month in other years) and calculates the chance of fire next week in each hexagon.",
      "A language AI (Claude) explains these numbers in plain language, but it does not create the numbers. A great hook for discussion: what can a model predict, how do we measure whether it is right, and why a forecast is not a certainty.",
    ],
  },
];

const PLANS: Plan[] = [
  {
    area: "Geography", serie: "7th grade (adaptable to 6th)", tempo: "2 classes of 50 min",
    titulo: "The fire calendar of the Cerrado",
    objetivos: ["Relate the seasonality of fire to the Cerrado climate (dry and rainy seasons).", "Read and interpret thematic maps and scales.", "Distinguish natural and human causes of wildfires."],
    bncc: ["EF07GE11", "EF06GE11", "EF06GE08"],
    passos: [
      "Warm-up (10 min): show the world map on this page in \"World\" mode and ask where students think there is the most fire on the planet. Then use the region button to zoom in on Matopiba.",
      "Exploration (20 min): in pairs, students use the Calendar in the Dashboard and note the 3 most intense months of 3 different years.",
      "Synthesis (20 min): build a dry season × rainy season timeline on the board. Why is fire concentrated between July and October?",
      "Class 2: debate the causes (agricultural management, deforestation, lightning) and consequences (health, biodiversity, climate).",
    ],
    perguntas: ["Does fire always happen in the same months? Why?", "What human activities use fire in the countryside?", "Is all fire in the Cerrado bad? (Research: the Cerrado is adapted to certain fire regimes.)"],
  },
  {
    area: "Science", serie: "8th–9th grade", tempo: "2 classes of 50 min",
    titulo: "Satellites that see heat",
    objetivos: ["Understand infrared radiation and remote sensing.", "Understand why different instruments measure different values.", "Propose actions to reduce wildfires in the community."],
    bncc: ["EF08CI16", "EF09CI13"],
    passos: [
      "Quick experiment (15 min): if a thermal camera or IR sensor is available, show hot and cold objects. Without equipment, use sample thermal images.",
      "Reading (15 min): the sections \"What is a hotspot?\" and \"MODIS and VIIRS\" on this page.",
      "Analysis (20 min): in the Dashboard, look at the harmonization chart. Why is the raw VIIRS line above the raw MODIS line?",
      "Class 2: in groups, develop a wildfire prevention campaign using real data from the site (download the CSV).",
    ],
    perguntas: ["Why does a smaller pixel detect smaller fires?", "If we change the thermometer in the middle of an experiment, how do we compare the results?", "What individual and collective actions reduce wildfires?"],
  },
  {
    area: "Math / Statistics", serie: "9th grade and High School", tempo: "2–3 classes",
    titulo: "Misleading charts and forecasts that get it right (or not)",
    objetivos: ["Identify chart elements that lead to errors (change of instrument).", "Build line charts from real data in a spreadsheet.", "Introduce probability and the evaluation of forecasts."],
    bncc: ["EF09MA21", "EF09MA22", "EM13MAT102", "EM13MAT406"],
    passos: [
      "Download the \"Monthly CSV 2003–today\" (top of this page) and open it in a spreadsheet (Google Sheets or Excel).",
      "Add up the columns modis_celulas_dia and viirs_celulas_dia by year and make a line chart. Discuss: was there really an explosion of fire in 2012?",
      "Compare with the harmonized series (column harmonizado_celulas_dia). What changed in the interpretation?",
      "High School: on the Forecast page, read the evaluation table. What does it mean for the model to \"beat\" climatology? With the class, calculate a simple hit rate using the risk CSV.",
    ],
    perguntas: ["Does a 60% chance of fire mean it will burn?", "Why compare the model with a simple guess (baseline)?", "What information was missing from the \"summed\" chart so that it would not mislead?"],
  },
];

const GLOSSARY: [string, string][] = [
  ["Hotspot", "A satellite pixel with a temperature far above its surroundings, indicating active fire at the moment of the pass."],
  ["FIRMS", "NASA system that freely distributes MODIS and VIIRS hotspots in near real time."],
  ["MODIS", "Sensor on the Terra and Aqua satellites (since 2000), with ~1 km pixels."],
  ["VIIRS", "Sensor on the Suomi NPP, NOAA-20 and NOAA-21 satellites (since 2012), with 375 m pixels."],
  ["Harmonization", "Converting series from different instruments to the same scale, so that periods can be compared."],
  ["H3", "Global hexagon grid created by Uber. We use level 6, with ~36 km² per hexagon."],
  ["Fire cell-day", "One hexagon on one day with at least one hotspot. It is the project's counting unit."],
  ["FRP", "Fire radiative power (MW): indicates the intensity of the detected fire."],
  ["Baseline", "A simple forecast used as a reference. A model is only useful if it is better than this."],
  ["Matopiba", "Agricultural frontier of the Cerrado in parts of Maranhão, Tocantins, Piauí and Bahia."],
];

function Reveal({ q, a, n }: { q: string; a: string; n: number }) {
  const [on, setOn] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-panel-2 p-3">
      <button className="press flex w-full items-start gap-3 text-left" aria-expanded={on} onClick={() => setOn(!on)}>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/20 text-xs font-bold text-brand">{n}</span>
        <span className="flex-1 text-sm font-medium">{q}</span>
        <span className="shrink-0 text-xs text-brand">{on ? "hide" : "show answer"}</span>
      </button>
      {on && <p className="step-in mt-2 border-l-2 border-brand pl-3 text-sm text-fg/85"><b className="text-brand">Expected answer:</b> {a}</p>}
    </li>
  );
}

function Section({ id, kicker, title, children, aside }: { id: string; kicker: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><p className="kicker">{kicker}</p><h2 className="h2 mt-1">{title}</h2></div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function Professores() {
  const meta = useApi<Meta>("/meta");
  const full = meta.data?.regions.filter((r) => !r.live && r.data_start && !r.key.startsWith("sample"));
  const region = meta.data && full?.find((r) => r.key === meta.data!.default_region)?.key;
  const reg = meta.data?.regions.find((r) => r.key === region);
  const hex = useApi<HexGridResponse>(region ? "/hexgrid" : null, { region, limit: 15000 });
  const fc = useApi<ForecastResponse>(region ? "/forecast" : null, { region, min_probability: 0.1 });
  const live = useApi<{ detections: Detection[]; total?: number }>("/world", { days: 1, limit: 12000 });
  const [tab, setTab] = useState(0);
  const plan = PLANS[tab];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <header className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-header/60 via-panel to-panel p-6 sm:p-8">
        <p className="kicker">For teachers</p>
        <h1 className="h1 mt-2 max-w-3xl">Wildfires seen from space, in the classroom</h1>
        <p className="mt-3 max-w-2xl text-fg/85">
          Real NASA data explained in plain language, with ready-made lesson plans for Geography, Science and Math.
          Free, with CSV downloads to work with in a spreadsheet.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a className="btn" href={region ? apiUrl("/export.csv", { region, kind: "monthly" }) : "#"}>⬇ Monthly CSV 2003–today</a>
          <a className="btn-ghost" href={region ? apiUrl("/export.csv", { region, kind: "forecast" }) : "#"}>⬇ Forecast CSV</a>
          <button className="btn-ghost print:hidden" onClick={() => window.print()}>🖨️ Print plan</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-ink-2">
          <span>🎓 {LEVELS.join(" and ")}</span><span>🧭 Aligned to BNCC, Brazil&apos;s national curriculum standard (reference codes)</span><span>⏱️ 50-minute classes</span>
        </div>
      </header>

      <nav aria-label="Sections" className="sticky top-[52px] z-30 -mx-3 flex gap-2 overflow-x-auto bg-bg/90 px-3 py-2 backdrop-blur print:hidden">
        {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} className="press shrink-0 rounded-full border border-line px-3 py-1 text-sm hover:bg-panel-2">{l}</a>)}
      </nav>

      <Section id="mapa" kicker="Explore" title="Interactive world map"
        aside={<span className="text-xs text-muted">Drag, zoom, and use the &quot;World&quot; and region buttons</span>}>
        <WorldMap bbox={reg?.bbox} regionName={reg?.name} initial="world" hexes={hex.data?.cells} hexMax={hex.data?.max_value}
          forecast={fc.data?.available ? fc.data.cells : undefined} detections={live.data?.detections} layers={{ forecast: false, detections: true }} height={520} />
        <p className="mt-2 text-xs text-muted">
          The dashed outline is the area monitored in detail (Matopiba, in the Cerrado). The hexagons show the last 30 days of fire, and the dots are the hotspots detected worldwide in the last 24 hours (yellow = VIIRS, pink = MODIS).
          The main page also has regions monitored live across several continents.
          {meta.error && <span className="text-bad"> · API unavailable: the map opens without data.</span>}
        </p>
      </Section>

      <Section id="conceitos" kicker="Background" title="Understand the concepts">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((t, i) => (
            <article key={t.title} className="card relative overflow-hidden">
              <span className="absolute right-3 top-2 font-display text-5xl font-bold text-white/5" aria-hidden>{i + 1}</span>
              <p className="text-3xl" aria-hidden>{t.icon}</p>
              <h3 className="mt-2 font-display text-lg font-semibold">{t.title}</h3>
              <div className="prose-pt mt-2 text-sm">{t.body.map((p, k) => <p key={k}>{p}</p>)}</div>
            </article>
          ))}
        </div>
      </Section>

      <Section id="planos" kicker="Lesson outlines" title="Lesson plans">
        <p className="mb-4 max-w-3xl text-sm text-muted">Suggestions to adapt to your class. The BNCC (Brazil&apos;s national curriculum standard) codes are for reference: check the official wording before recording them.</p>
        <div role="tablist" aria-label="Subjects" className="mb-4 flex flex-wrap gap-2 print:hidden">
          {PLANS.map((p, i) => (
            <button key={p.titulo} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
              className={`press rounded-full border px-4 py-1.5 text-sm ${tab === i ? "border-brand bg-brand font-semibold text-brand-ink" : "border-line bg-panel hover:bg-panel-2"}`}>{p.area}</button>
          ))}
        </div>
        <article key={plan.titulo} role="tabpanel" className="step-in card">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip">{plan.serie}</span><span className="chip">⏱️ {plan.tempo}</span>
            {plan.bncc.map((c) => <span key={c} className="chip border-brand/40 text-brand">{c}</span>)}
          </div>
          <h3 className="mt-3 font-display text-2xl font-semibold">{plan.titulo}</h3>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">Objectives</h4>
              <ul className="space-y-2 text-sm">
                {plan.objetivos.map((x) => <li key={x} className="flex gap-2"><span className="text-brand" aria-hidden>✓</span>{x}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">Step by step</h4>
              <ol className="relative space-y-3 border-l border-line pl-5 text-sm">
                {plan.passos.map((x, i) => (
                  <li key={x} className="relative">
                    <span className="absolute -left-[29px] grid size-5 place-items-center rounded-full bg-fire text-[10px] font-bold text-black">{i + 1}</span>{x}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">Discussion questions</h4>
          <ul className="grid gap-2 lg:grid-cols-3">
            {plan.perguntas.map((q, i) => <Reveal key={q} q={q} a={ANSWERS[tab][i]} n={i + 1} />)}
          </ul>
        </article>
      </Section>

      <Section id="ia" kicker="Artificial intelligence" title="The forecast explained for the class">
        <InsightCard region={region ?? undefined} audience="professor" />
      </Section>

      <Section id="escola" kicker="From the classroom to the community" title="Bring the alerts to your school">
        <div className="card grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm text-fg/85">
              Students can print this QR code and post it on bulletin boards at schools, health clinics and fire stations. Anyone who scans it opens, on their phone, the sign-up
              to receive a Telegram alert when a satellite detects a hotspot near home.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg/85">
              <li>Activity: research with the class which municipalities in the region have the most detections this month.</li>
              <li>Discussion: why is a detected hotspot not necessarily a wildfire?</li>
              <li>Caution: sign-up asks for personal data. Minors need a guardian&apos;s permission.</li>
            </ul>
          </div>
          <PosterQr title="QR code for the school bulletin board" />
        </div>
      </Section>

      <Section id="glossario" kicker="Quick reference" title="Glossary">
        <dl className="grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-line bg-panel p-4"><dt className="font-semibold text-fire-2">{t}</dt><dd className="mt-1 text-sm text-fg/85">{d}</dd></div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
