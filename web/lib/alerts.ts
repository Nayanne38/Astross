import { API_URL } from "./fire-data";

// Mirrors api/alerts.py
export type RecipientKind = "cidadao" | "bombeiro";
export interface AlertsConfig { bot_username: string | null; bot_enabled: boolean; citizen_radius_km: number }
export interface GeocodeHit { label: string; lat: number; lon: number; city: string | null; state: string | null }
export interface Registration {
  kind: RecipientKind; first_name: string; city: string | null; state: string | null; radius_km: number;
  area: [number, number, number, number] | null; link_token: string; telegram_link: string | null;
  connected: boolean; preview_html: string;
}

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
  "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const FIELD_PT: Record<string, string> = {
  full_name: "Full name", phone: "Phone", age: "Age", address: "Address", lat: "Map location",
  lon: "Map location", unit: "Unit", city: "City", state: "State / province", country: "Country", consent: "Consent",
};

/** FastAPI returns a string detail, or a list of Pydantic errors (422). Turn both into English text. */
function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e: { loc?: (string | number)[]; msg?: string }) => {
      const field = String(e.loc?.[e.loc.length - 1] ?? "");
      const msg = (e.msg ?? "invalid").replace(/^Value error, /, "");
      return `${FIELD_PT[field] ?? field}: ${msg}`;
    }).join(" · ");
  }
  return "Unexpected error.";
}

export async function alertsApi<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let r: Response;
  try {
    r = await fetch(new URL(path, API_URL), json === undefined ? rest : {
      ...rest, method: rest.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
    });
  } catch {
    throw new Error("Cannot reach the FIRETRACK server. Please try again shortly.");
  }
  if (!r.ok) {
    let d: unknown = r.statusText;
    try { d = (await r.json()).detail; } catch { /* not json */ }
    throw new Error(detailText(d));
  }
  return r.json() as Promise<T>;
}

/** Telegram HTML -> safe HTML for the preview bubble (only <b>, <i>, <a href="http..."> survive). */
export function telegramHtml(src: string): string {
  return src
    .replace(/<(?!\/?(b|i)>|a href="https?:\/\/[^"<>]*">|\/a>)[^>]*>/g, "")
    .replace(/<a href="/g, '<a target="_blank" rel="noreferrer" href="')
    .replace(/\n/g, "<br/>");
}
