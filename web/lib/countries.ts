/** ISO 3166-1 alpha-2 -> international dial code (no "+"). Names come from Intl.DisplayNames. */
export const DIAL: Record<string, string> = {
  AR: "54", AU: "61", AT: "43", BE: "32", BO: "591", BR: "55", CA: "1", CL: "56", CN: "86", CO: "57", CR: "506", CZ: "420",
  DK: "45", EC: "593", EG: "20", ES: "34", ET: "251", FI: "358", FR: "33", DE: "49", GH: "233", GR: "30", GT: "502", HN: "504",
  HK: "852", HU: "36", IN: "91", ID: "62", IE: "353", IL: "972", IT: "39", JP: "81", KE: "254", KR: "82", MY: "60", MX: "52",
  MA: "212", MZ: "258", NL: "31", NZ: "64", NI: "505", NG: "234", NO: "47", PK: "92", PA: "507", PY: "595", PE: "51", PH: "63",
  PL: "48", PT: "351", RO: "40", RU: "7", SA: "966", SG: "65", ZA: "27", SE: "46", CH: "41", TH: "66", TR: "90", UA: "380",
  AE: "971", GB: "44", US: "1", UY: "598", VE: "58", VN: "84", AO: "244", BD: "880", CD: "243", TZ: "255", UG: "256", ZM: "260",
  ZW: "263", LK: "94", NP: "977", KH: "855", MM: "95", LA: "856", PG: "675", FJ: "679", DZ: "213", TN: "216", LB: "961", JO: "962",
};

export function countryName(cc: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc; } catch { return cc; }
}

export const COUNTRIES: { cc: string; name: string; dial: string }[] =
  Object.keys(DIAL).map((cc) => ({ cc, name: countryName(cc), dial: DIAL[cc] })).sort((a, b) => a.name.localeCompare(b.name));

/** "+<dial><digits>" from a dial code and what the person typed (a leading 0 is dropped; a typed "+" is kept). */
export function e164(dial: string, typed: string): string {
  const d = typed.replace(/\D/g, "");
  if (typed.trim().startsWith("+")) return `+${d}`;
  return `+${dial}${d.replace(/^0+/, "")}`;
}
