// Language bundles. pt-BR for visitors in Brazil, English for everyone else (see lib/i18n.ts).
import { copy, harm, prev, urg, sobre, cal, dados } from "./copy";
import { EMERGENCY } from "./emergency";
import { extra } from "./extra";
import { EMERGENCY_EN, calEn, copyEn, dadosEn, extraEn, harmEn, prevEn, sobreEn, urgEn } from "./en";
import type { Lang } from "@/lib/i18n";

/** Same shape with every string widened, so the English bundle is checked key by key. */
type Widen<T> = T extends string ? string
  : T extends readonly (infer U)[] ? readonly Widen<U>[]
  : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;

const pt = { copy, harm, prev, urg, sobre, cal, dados, emergency: EMERGENCY, ...extra };
export type Bundle = Widen<typeof pt>;
const en: Bundle = { copy: copyEn, harm: harmEn, prev: prevEn, urg: urgEn, sobre: sobreEn, cal: calEn, dados: dadosEn, emergency: EMERGENCY_EN, ...extraEn };

export const BUNDLES: Record<Lang, Bundle> = { pt, en };
