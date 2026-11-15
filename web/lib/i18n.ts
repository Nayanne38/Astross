// Language choice: Brazilian visitors get pt-BR, everyone else English.
// Country comes from the hosting edge (IP geolocation done by Vercel / Cloudflare / CloudFront),
// so no visitor IP is sent to any third party. Without a country header (local dev, other hosts)
// we fall back to the browser language. A manual choice (header toggle) is kept in a cookie and wins.
export type Lang = "pt" | "en";
export const LANG_COOKIE = "firetrack.lang";
export const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"];

export function isLang(v: unknown): v is Lang {
  return v === "pt" || v === "en";
}

export function langFromCountry(country: string | null | undefined): Lang | null {
  const c = (country || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX") return null; // XX = unknown (Cloudflare)
  return c === "BR" ? "pt" : "en";
}

export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  const first = (header || "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("pt") ? "pt" : "en";
}

export function detectLang(opts: { cookie?: string | null; country?: string | null; acceptLanguage?: string | null }): Lang {
  if (isLang(opts.cookie)) return opts.cookie;
  return langFromCountry(opts.country) ?? langFromAcceptLanguage(opts.acceptLanguage);
}
