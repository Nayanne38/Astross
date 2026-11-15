import type { Lang } from "./i18n";

const loc = (l: Lang) => (l === "pt" ? "pt-BR" : "en-US");
const MINUS = "−";

export function fmtInt(v: number | null | undefined, l: Lang): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString(loc(l)).replace("-", MINUS);
}

export function fmtNum(v: number | null | undefined, l: Lang, nd = 1, sign = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = v.toLocaleString(loc(l), { minimumFractionDigits: nd, maximumFractionDigits: nd }).replace("-", MINUS);
  return sign && v > 0 ? `+${s}` : s;
}

export function fmtPct(v: number | null | undefined, l: Lang, nd = 1, sign = false): string {
  const s = fmtNum(v, l, nd, sign);
  return s === "—" ? s : `${s}%`;
}

export function fmtDate(iso: string | null | undefined, l: Lang): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return l === "pt" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

export function fmtDateTime(iso: string | null | undefined, l: Lang): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return { date: fmtDate(iso, l), time: "" };
  return {
    date: d.toLocaleDateString(loc(l)),
    time: d.toLocaleTimeString(loc(l), { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Replace {name} placeholders. */
export function tpl(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}
