"use client";

import { COUNTRY_COOKIE, isCountry, regionFromAcceptLanguage } from "@/lib/emergency-numbers";
import { LANG_COOKIE } from "@/lib/i18n";
import { AppProviders } from "./app-state";

function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1];
}

/** Static-hosting (GitHub Pages) version of LangGate: no request-time cookies/headers, reads them in the browser. */
export function LangGateStatic({ children }: { children: React.ReactNode }) {
  const lang = cookie(LANG_COOKIE) === "pt" ? "pt" : "en";
  const chosen = cookie(COUNTRY_COOKIE)?.toUpperCase();
  const fromBrowser = typeof navigator !== "undefined" ? regionFromAcceptLanguage(navigator.language) : null;
  const cc = isCountry(chosen) ? chosen : fromBrowser?.toUpperCase();
  return <AppProviders initialLang={lang} initialCountry={cc && isCountry(cc) && cc !== "XX" ? cc : null}>{children}</AppProviders>;
}
