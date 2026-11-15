// Emergency numbers by country (ISO 3166-1 alpha-2). The country comes from the hosting edge
// (IP geolocation header, see lib/i18n.ts COUNTRY_HEADERS), never from a third-party IP service.
// Without a header (local dev) we fall back to the region in the browser language, and the visitor
// can always pick another country on /urgencia (kept in a cookie).
// Brazil's numbers were checked against official state pages (content/emergency.ts); the others
// are the widely published national numbers and are flagged "confirm locally" in the UI.
export const COUNTRY_COOKIE = "firetrack.country";

export interface Contact { number: string; pt: string; en: string; whenPt: string; whenEn: string }
export interface CountryEmergency { fire: Contact; general?: Contact; verified?: boolean }

const c = (number: string, pt: string, en: string, whenPt: string, whenEn: string): Contact => ({ number, pt: en, en, whenPt: whenEn, whenEn }); // English only: pt fields mirror en
const FIRE_PT = "Fogo perto de pessoas, casas ou estradas; resgate.";
const FIRE_EN = "Fire near people, homes or roads; rescue.";
const GEN_PT = "Emergência geral (polícia, bombeiros, ambulância).";
const GEN_EN = "General emergency (police, fire, ambulance).";
const one = (n: string, ptName: string, enName: string): CountryEmergency => ({ fire: c(n, ptName, enName, GEN_PT, GEN_EN) });

export const EMERGENCY_BY_COUNTRY: Record<string, CountryEmergency> = {
  BR: { verified: true, fire: c("193", "Corpo de Bombeiros", "Fire Department", FIRE_PT, FIRE_EN),
    general: c("199", "Defesa Civil", "Civil Defense", "Risco coletivo, fumaça intensa, evacuação. Pode variar por município.", "Collective risk, heavy smoke, evacuation. May vary by municipality.") },
  US: one("911", "Emergência (911)", "Emergency (911)"),
  CA: one("911", "Emergência (911)", "Emergency (911)"),
  MX: one("911", "Emergência (911)", "Emergency (911)"),
  AR: { fire: c("100", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN), general: c("911", "Emergências", "Emergencies", GEN_PT, GEN_EN) },
  CL: { fire: c("132", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN) },
  CO: { fire: c("119", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN), general: c("123", "Emergências", "Emergencies", GEN_PT, GEN_EN) },
  PE: { fire: c("116", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN) },
  BO: { fire: c("119", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN) },
  PY: { fire: c("132", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN) },
  UY: { fire: c("104", "Bomberos", "Fire Department (Bomberos)", FIRE_PT, FIRE_EN), general: c("911", "Emergências", "Emergencies", GEN_PT, GEN_EN) },
  EC: one("911", "Emergência (911)", "Emergency (911)"),
  VE: { fire: c("171", "Emergências", "Emergencies", GEN_PT, GEN_EN) },
  PT: one("112", "Emergência (112)", "Emergency (112)"),
  ES: one("112", "Emergência (112)", "Emergency (112)"),
  FR: { fire: c("18", "Sapeurs-pompiers", "Fire Department (Sapeurs-pompiers)", FIRE_PT, FIRE_EN), general: c("112", "Emergência europeia", "European emergency", GEN_PT, GEN_EN) },
  DE: one("112", "Emergência (112)", "Emergency (112)"),
  IT: { fire: c("115", "Vigili del Fuoco", "Fire Department (Vigili del Fuoco)", FIRE_PT, FIRE_EN), general: c("112", "Emergência europeia", "European emergency", GEN_PT, GEN_EN) },
  GR: { fire: c("199", "Bombeiros", "Fire Service", FIRE_PT, FIRE_EN), general: c("112", "Emergência europeia", "European emergency", GEN_PT, GEN_EN) },
  GB: one("999", "Emergência (999)", "Emergency (999)"),
  IE: one("112", "Emergência (112)", "Emergency (112)"),
  AU: one("000", "Emergência (000)", "Emergency (000)"),
  NZ: one("111", "Emergência (111)", "Emergency (111)"),
  ZA: { fire: c("10177", "Ambulância e bombeiros", "Ambulance and fire", FIRE_PT, FIRE_EN), general: c("112", "Emergência (celular)", "Emergency (mobile)", GEN_PT, GEN_EN) },
  IN: { fire: c("101", "Bombeiros", "Fire Service", FIRE_PT, FIRE_EN), general: c("112", "Emergência", "Emergency", GEN_PT, GEN_EN) },
  JP: { fire: c("119", "Bombeiros e ambulância", "Fire and ambulance", FIRE_PT, FIRE_EN) },
  CN: { fire: c("119", "Bombeiros", "Fire Department", FIRE_PT, FIRE_EN) },
  KR: { fire: c("119", "Bombeiros e ambulância", "Fire and ambulance", FIRE_PT, FIRE_EN) },
};

/** Fallback for any country not listed: 112 works on GSM phones in many countries, but it is not universal. */
export const FALLBACK: CountryEmergency = { fire: c("112", "Número de emergência internacional (GSM)", "International emergency number (GSM)", "Funciona em muitos países, mas não em todos. Confirme o número local.", "Works in many countries, but not all. Confirm the local number.") };

export const COUNTRY_CODES = Object.keys(EMERGENCY_BY_COUNTRY).sort();

export function isCountry(v: unknown): v is string {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v);
}

/** Region from an Accept-Language header, e.g. "pt-BR,en;q=0.8" -> "BR" (dev fallback only). */
export function regionFromAcceptLanguage(h: string | null | undefined): string | null {
  const m = (h || "").split(",")[0]?.trim().match(/^[a-z]{2,3}-([A-Za-z]{2})\b/);
  return m ? m[1].toUpperCase() : null;
}

export function emergencyFor(country: string | null | undefined): { data: CountryEmergency; listed: boolean } {
  const d = country ? EMERGENCY_BY_COUNTRY[country] : undefined;
  return d ? { data: d, listed: true } : { data: FALLBACK, listed: false };
}
