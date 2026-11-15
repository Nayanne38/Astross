import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE, isCountry, regionFromAcceptLanguage } from "@/lib/emergency-numbers";
import { COUNTRY_HEADERS, LANG_COOKIE, detectLang } from "@/lib/i18n";
import { AppProviders } from "./app-state";

/** Reads cookie/headers (request-time data), so it must sit inside <Suspense> in the layout. */
export async function LangGate({ children }: { children: React.ReactNode }) {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const edgeCountry = COUNTRY_HEADERS.map((k) => h.get(k)).find(Boolean) ?? null;
  const al = h.get("accept-language");
  void detectLang; void LANG_COOKIE;
  const lang = "en" as const; // the whole system is English
  // The visitor's own choice wins, then the edge IP country, then the browser region (local dev).
  const chosen = c.get(COUNTRY_COOKIE)?.value?.toUpperCase();
  const country = isCountry(chosen) ? chosen : (edgeCountry?.toUpperCase() ?? regionFromAcceptLanguage(al));
  return <AppProviders initialLang={lang} initialCountry={country && isCountry(country) && country !== "XX" ? country : null}>{children}</AppProviders>;
}
