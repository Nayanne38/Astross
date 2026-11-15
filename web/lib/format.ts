export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
export const int = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf0.format(v));
export const num = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const signedPct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), d)}%`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
export function brDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
