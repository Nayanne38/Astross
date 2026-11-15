"""Camada educativa determinística (docs/EDUCACAO_ODS.md §5, §6, §10).

Transforma cada resposta da API em aprendizado: cartões "o que você vê", o bloco obrigatório
"o que este dado NÃO diz", avisos de procedência, perguntas guiadas, texto acessível, termos do
glossário e metas ODS. Regras:

* Determinismo total: só templates pt-BR preenchidos com números da própria resposta. Sem LLM.
  A mesma entrada gera o mesmo texto e os mesmos ids.
* Três níveis de linguagem: simples (padrão, sem jargão), estudante (introduz o termo), tecnico.
* Nunca afirmar o que o dado não sustenta: ver FORBIDDEN (verificado em tests/test_education.py).
* Descrever, nunca atribuir causa. Comparar sempre com referência explícita (n anos, intervalo).

Funções puras: recebem fatos já calculados + um contexto (Ctx) e devolvem `Learn`.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd
import yaml

from api.schemas import (Accessible, Caveat, GlossaryTerm, GuidedQuestion, Learn, LearnCard, LearningPath,
                         PathStep, Provenance)

CONTENT = Path(__file__).resolve().parent / "content"
NIVEIS = ("simples", "estudante", "tecnico")
VIIRS_START = date(2012, 1, 20)          # first day of the VIIRS (SNPP) reference series
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
         "outubro", "novembro", "dezembro"]
H3_AREA_KM2 = {4: 1770, 5: 253, 6: 36, 7: 5.2, 8: 0.74}   # average H3 cell area

# ------------------------------------------------------------------ vocabulary & honesty
# What the texts NEVER claim (§5.2). A match is allowed only if a negation precedes it in the
# same sentence ("não significa que toda a área esteja em chamas").
FORBIDDEN = [
    r"áreas? queimadas?", r"(hectares|km²|quilômetros quadrados) queimad", r"em chamas",
    r"incêndios? confirmad", r"número de incêndios", r"causad[oa]s? (por|pel)", r"\bcerteza\b",
    r"\bvai (queimar|pegar fogo|acontecer)", r"risco de incêndio", r"\bcomprova", r"\bprovam?\b",
    r"(maior|menor) da história", r"\bsem fogo\b",
]
_NEG = re.compile(r"\b(não|nem|nunca|sem)\b", re.IGNORECASE)
JARGON_SIMPLES = ["percentil", "z =", "NRT", "H3", "quantil", "VIIRS-equivalente", "desvio-padrão"]


def violations(text: str) -> list[str]:
    """Forbidden claims in `text` (empty list = ok)."""
    out = []
    for sent in re.split(r"(?<=[.!?])\s+", text):
        for pat in FORBIDDEN:
            m = re.search(pat, sent, re.IGNORECASE)
            if m and not _NEG.search(sent[:m.start()]):
                out.append(f"{pat!r} em: {sent}")
    return out


# ------------------------------------------------------------------ pt-BR formatting
def br_int(v: float) -> str:
    """12345.6 -> '12.346' (pt-BR thousands separator)."""
    return f"{v:,.0f}".replace(",", ".")


def br_num(v: float, nd: int = 1, sign: bool = False) -> str:
    """-0.83 -> '−0,8' (pt-BR decimal comma, typographic minus)."""
    s = f"{v:+,.{nd}f}" if sign else f"{v:,.{nd}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".").replace("-", "−")


def pct(v: float) -> str:
    return f"{v * 100:.0f}%"


def fmt_date(d: date) -> str:
    day = "1º" if d.day == 1 else str(d.day)
    return f"{day} de {MESES[d.month - 1]} de {d.year}"


def fmt_month(year: int, month: int) -> str:
    return f"{MESES[month - 1]} de {year}"


def area_km2(res: int) -> str:
    return br_num(H3_AREA_KM2.get(res, 36), 0) if H3_AREA_KM2.get(res, 36) >= 10 else br_num(H3_AREA_KM2[res], 1)


_FALA = [("−", "menos "), ("≥", "pelo menos "), ("≤", "no máximo "), ("~", "cerca de "), ("×", " vezes "),
         ("km²", "quilômetros quadrados"), ("R²", "R ao quadrado"), ("%", " por cento"), ("–", " a "),
         ("→", " para ")]


def falavel(text: str) -> str:
    """Screen-reader friendly version: no typographic symbols (§5.1 item 10, §9)."""
    for a, b in _FALA:
        text = text.replace(a, b)
    return re.sub(r"\s{2,}", " ", text).strip()


def _clip(s: str, n: int = 150) -> str:
    if len(s) <= n:
        return s
    cut = s[: n - 1].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def pick(nivel: str, simples: str, estudante: Optional[str] = None, tecnico: Optional[str] = None) -> str:
    if nivel == "tecnico":
        return tecnico or estudante or simples
    if nivel == "estudante":
        return estudante or simples
    return simples


# ------------------------------------------------------------------ context
@dataclass(frozen=True)
class Ctx:
    nivel: str = "simples"
    region: str = ""
    area_label: str = ""
    custom: bool = False
    is_synthetic: bool = False
    provisional_from: Optional[date] = None
    provisional_exact: bool = True
    last_run: Optional[str] = None
    tz_offset: int = -3
    res: int = 6
    method: Optional[str] = None
    fonte: str = ""

    @property
    def km2(self) -> str:
        return area_km2(self.res)


def provenance(ctx: Ctx, start: Optional[date] = None, end: Optional[date] = None) -> Provenance:
    eras = []
    if start is None or start < VIIRS_START:
        eras.append("estimado_MODIS (antes de 20/01/2012)")
    if end is None or end >= VIIRS_START:
        eras.append("VIIRS_referencia (um satélite por dia)")
    if ctx.provisional_from and (end is None or end >= ctx.provisional_from):
        eras.append("provisorio_NRT")
    return Provenance(fonte=ctx.fonte, atualizado_em=ctx.last_run, provisional_from=ctx.provisional_from,
                      provisional_exact=ctx.provisional_exact, eras=eras, is_synthetic=ctx.is_synthetic,
                      metodo=ctx.method)


def caveats(ctx: Ctx, start: Optional[date], end: Optional[date]) -> list[Caveat]:
    """Cross-cutting caveats (§6, 'Avisos transversais'), only when they apply to the selection."""
    out = []
    if ctx.is_synthetic:
        out.append(Caveat(codigo="sintetico", texto="Dados de amostra sintética, só para demonstração. "
                                                    "Não representam queimadas reais."))
    pf = ctx.provisional_from
    if pf and (end is None or end >= pf):
        pre = "Os dias" if ctx.provisional_exact else "Pelo menos os dias"
        out.append(Caveat(codigo="nrt", texto=pick(
            ctx.nivel,
            f"{pre} a partir de {fmt_date(pf)} são provisórios e podem mudar quando a NASA publicar a "
            f"versão definitiva.",
            f"{pre} a partir de {fmt_date(pf)} são provisórios (tempo quase real) e podem mudar quando a "
            f"NASA publicar a versão definitiva.",
            f"{pre} a partir de {fmt_date(pf)} vêm de produtos NRT (provisórios); a equivalência NRT→SP "
            f"não foi verificada no fim da série.")))
    if start is not None and start < VIIRS_START:
        out.append(Caveat(codigo="era_modis", texto=pick(
            ctx.nivel,
            "Antes de 2012 só existia o satélite MODIS, que vê menos. Os valores desse período são "
            "estimativas, com incerteza maior.",
            "Antes de 2012 só existia o sensor MODIS, menos sensível. Os valores desse período são "
            "estimativas na escala do VIIRS (calibração), com incerteza maior.",
            "Antes de 20/01/2012 a série é uma estimativa: MODIS calibrado para a escala VIIRS (quantile "
            "mapping mensal), com incerteza maior que no período VIIRS.")))
        if ctx.custom:
            out.append(Caveat(codigo="custom_pre2012", texto=(
                "Em áreas desenhadas, os anos antes de 2012 tendem a aparecer menores do que foram: parte do "
                "valor estimado para a região não pode ser atribuída a hexágonos específicos. Uma alta recente "
                "comparada a esse período pode ser, em parte, efeito do método.")))
    return out


def _learn(view: str, ctx: Ctx, cards: list[LearnCard], nao_diz: list[str], avisos: list[Caveat],
           perguntas: list[tuple[str, str]], glossario: list[str], ods: list[str], alt: str,
           destaques: list[str], start: Optional[date], end: Optional[date]) -> Learn:
    longa = " ".join([c.texto for c in cards if c.slot == "situacao"] + [a.texto for a in avisos[:2]])
    longa = longa or alt
    return Learn(view=view, nivel=ctx.nivel, cards=cards, nao_diz=nao_diz, avisos=avisos,
                 perguntas=[GuidedQuestion(tipo=t, texto=x) for t, x in perguntas],
                 procedencia=provenance(ctx, start, end),
                 acessivel=Accessible(alt_curto=_clip(alt), descricao_longa=longa, falavel=falavel(longa),
                                      destaques=destaques),
                 glossario=glossario, ods=ods)


def _card(id_: str, slot: str, gatilho: str, titulo: str, texto: str, dica: Optional[str] = None) -> LearnCard:
    return LearnCard(id=id_, slot=slot, gatilho=gatilho, titulo=titulo, texto=texto, dica_professor=dica)


# ------------------------------------------------------------------ months (calendar / summary)
CATEGORY_DESC = {"muito_abaixo": "bem abaixo do que costuma ocorrer", "abaixo": "abaixo do que costuma ocorrer",
                 "normal": "na faixa típica", "acima": "acima do que costuma ocorrer",
                 "muito_acima": "bem acima do que costuma ocorrer"}


def category(p: Optional[float]) -> str:
    """Category from the percentile (fire counts are skewed, so the z-score alone misleads)."""
    if p is None or (isinstance(p, float) and math.isnan(p)):
        return "indisponivel"
    return ("muito_abaixo" if p < 10 else "abaixo" if p < 33 else "normal" if p <= 67
            else "acima" if p <= 90 else "muito_acima")


@dataclass(frozen=True)
class MonthFacts:
    year: int
    month: int
    value: float                  # harmonized total
    daily_mean: float
    percentile: Optional[float]
    zscore: Optional[float]
    is_partial: bool
    obs_days: int
    days_in_month: int
    n_ref: int                    # complete years of the same month used as reference
    ref_min: Optional[int]
    ref_max: Optional[int]
    n_lower: int                  # reference years with a lower daily mean
    n_higher: int                 # reference years with a higher daily mean
    is_provisional: bool
    is_top: bool = False

    @property
    def cat(self) -> str:
        return category(self.percentile)


def _isnan(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


def month_facts(m: pd.DataFrame, row, provisional_from: Optional[date] = None, is_top: bool = False) -> MonthFacts:
    """Facts for one month of q.monthly(), with the same reference rule as
    etl/transform/harmonize.add_anomalies (same month, other years, complete months only)."""
    ref = m[(m.month == row.month) & (m.year != row.year) & ~m.is_partial.astype(bool)]
    x = float(row.daily_mean)
    dim = int(row.days_in_month)
    last_day = date(int(row.year), int(row.month), dim)
    p = None if _isnan(row.percentile) else float(row.percentile)
    z = None if _isnan(row.anomaly_zscore) else float(row.anomaly_zscore)
    return MonthFacts(year=int(row.year), month=int(row.month), value=float(row.harmonized_total), daily_mean=x,
                      percentile=p, zscore=z, is_partial=bool(row.is_partial), obs_days=int(row.obs_days),
                      days_in_month=dim, n_ref=int(len(ref)),
                      ref_min=int(ref.year.min()) if len(ref) else None,
                      ref_max=int(ref.year.max()) if len(ref) else None,
                      n_lower=int((ref.daily_mean < x).sum()), n_higher=int((ref.daily_mean > x).sum()),
                      is_provisional=bool(provisional_from and last_day >= provisional_from), is_top=is_top)


def _ref(f: MonthFacts) -> str:
    return f"{f.ref_min}–{f.ref_max}" if f.ref_min != f.ref_max else str(f.ref_min)


def anomaly_core(f: MonthFacts, area: str, nivel: str) -> str:
    """Main comparison sentence for a month (fixes A2–A5 of the council report)."""
    mes = fmt_month(f.year, f.month)
    if f.cat == "indisponivel":
        return pick(nivel,
                    f"Ainda não há anos suficientes (mínimo de 3 completos) para comparar {mes}.",
                    f"Ainda não há histórico suficiente para comparar {mes}: são necessários 3 anos completos "
                    f"do mesmo mês e há {f.n_ref}.",
                    f"Ainda não há histórico suficiente para comparar {mes} (n_ref = {f.n_ref} anos completos; mínimo 3).")
    desc = CATEGORY_DESC[f.cat]
    if f.is_partial:
        val = f"média de {br_num(f.daily_mean, 1)} células-dia com detecção de foco de calor por dia observado"
    else:
        val = f"{br_int(f.value)} células-dia com detecção de foco de calor"
    simples = (f"{mes.capitalize()} ficou {desc} para {area}, comparado a {f.n_ref} anos ({_ref(f)}). "
               f"Em {f.n_lower} desses {f.n_ref} anos, {MESES[f.month - 1]} teve média por dia menor.")
    estudante = (f"{mes.capitalize()} ficou {desc} para {area}: {val}. Isso corresponde ao percentil "
                 f"{f.percentile:.0f} (a posição entre os {f.n_ref} anos comparados, {_ref(f)}; 50 é o meio).")
    z = f" (z = {br_num(f.zscore, 1, sign=True)})" if f.zscore is not None else ""
    tecnico = (f"{mes.capitalize()} está {desc} para {area}: {val}; percentil {f.percentile:.0f}{z} da média "
               f"diária em relação ao mesmo mês em {f.n_ref} anos completos ({_ref(f)}).")
    return pick(nivel, simples, estudante, tecnico)


def anomaly_notes(f: MonthFacts, nivel: str) -> list[str]:
    notes = []
    if f.is_partial:
        notes.append(pick(nivel,
                          f"O mês ainda está incompleto ({f.obs_days} de {f.days_in_month} dias), por isso "
                          f"comparamos a média por dia, não o total.",
                          tecnico=f"Mês parcial (incompleto): {f.obs_days}/{f.days_in_month} dias observados; "
                                  f"comparação pela média por dia."))
    if f.is_provisional:
        notes.append(pick(nivel, "Os dias mais recentes são provisórios e podem mudar.",
                          "Os dias mais recentes são provisórios (tempo quase real) e podem mudar.",
                          "Inclui dias NRT (provisórios)."))
    return notes


def anomaly_texts(f: MonthFacts, area: str) -> dict[str, str]:
    return {n: " ".join([anomaly_core(f, area, n)] + anomaly_notes(f, n)) for n in NIVEIS}


def month_cards(f: MonthFacts, ctx: Ctx, top_n: int = 0) -> list[LearnCard]:
    n = ctx.nivel
    mes = fmt_month(f.year, f.month)
    cards = [_card(f"cal.categoria.{f.cat}" if f.cat != "indisponivel" else "cal.indisponivel", "situacao",
                   "percentile is None" if f.cat == "indisponivel" else f"categoria do percentil = {f.cat}",
                   "Como este mês se compara", anomaly_core(f, ctx.area_label, n),
                   "Peça para a turma dizer com quantos anos o mês foi comparado e por que isso importa.")]
    if f.is_partial:
        cards.append(_card("cal.parcial", "cautela", "is_partial", "Mês incompleto", pick(
            n, f"{mes.capitalize()} ainda está incompleto: {f.obs_days} de {f.days_in_month} dias observados. "
               f"Por isso comparamos a média por dia ({br_num(f.daily_mean, 1)} por dia), não o total.",
            tecnico=f"Mês incompleto: obs_days = {f.obs_days} < days_in_month = {f.days_in_month}; comparação por dia (daily_mean = "
                    f"{br_num(f.daily_mean, 2)}).")))
    if f.cat != "indisponivel" and f.n_ref >= 3 and (f.n_lower == f.n_ref or f.n_higher == f.n_ref):
        lado = "maior" if f.n_lower == f.n_ref else "menor"
        cards.append(_card("cal.extremo", "cautela", "menor ou maior entre os anos comparados",
                           "Extremo entre poucos anos", (
                               f"É o {lado} valor de {MESES[f.month - 1]} entre os {f.n_ref} anos comparados "
                               f"({_ref(f)}). Isso não quer dizer que seja o {lado} de todos os tempos: são só "
                               f"{f.n_ref} anos." + (" E os dias mais recentes ainda são provisórios."
                                                     if f.is_provisional else "")),
                           "Equívoco comum: 'percentil 0 = nunca houve tão pouco fogo'."))
    if 3 <= f.n_ref < 10:
        cards.append(_card("cal.n_pequeno", "cautela", "3 <= n_ref < 10", "Poucos anos de comparação", (
            f"A comparação usa só {f.n_ref} anos. Com poucos anos, a posição muda muito se um único ano for "
            f"diferente.")))
    if f.is_top and top_n:
        cards.append(_card("cal.top", "contexto", "is_top", "Entre os meses com mais detecções", (
            f"Este é um dos {top_n} meses completos com mais células-dia com detecção no período escolhido.")))
    return cards


MONTH_NAO_DIZ = [
    "Não é área queimada: um hexágono de cerca de 36 km² conta 1 no dia, seja 1 foco ou 500.",
    "Meses com muita nuvem ou fumaça podem parecer mais fracos do que foram.",
    "Estar acima do que costuma ocorrer não diz a causa.",
]


def seasonal_share(sel: pd.DataFrame) -> Optional[float]:
    """Median share of the yearly value in July–October, over complete years of the selection."""
    full = sel[~sel.is_partial.astype(bool)]
    years = full.groupby("year").month.count()
    years = years[years == 12].index
    shares = []
    for y in years:
        g = full[full.year == y]
        tot = g.harmonized_total.sum()
        if tot > 0:
            shares.append(g[g.month.between(7, 10)].harmonized_total.sum() / tot)
    return float(pd.Series(shares).median()) if shares else None


def learn_calendar(f: MonthFacts, ctx: Ctx, start: date, end: date, n_months: int, peak: Optional[MonthFacts],
                   season: Optional[float], top_n: int) -> Learn:
    cards = month_cards(f, ctx, top_n)
    if season is not None and season >= 0.7:
        cards.append(_card("cal.sazonal", "contexto", "julho–outubro >= 70% do ano (mediana)", "O ritmo do fogo", pick(
            ctx.nivel,
            f"Ano após ano, a maior parte das detecções acontece entre julho e outubro ({pct(season)} em um ano "
            f"típico deste período), na estação seca do Cerrado.",
            tecnico=f"Mediana da fração anual em jul–out = {pct(season)} (anos completos do período).")))
    alt = f"Calendário mensal de {ctx.area_label}, {fmt_month(start.year, start.month)} a " \
          f"{fmt_month(end.year, end.month)}: {n_months} meses"
    destaques = []
    if peak is not None:
        alt += f"; maior valor em {fmt_month(peak.year, peak.month)} ({br_int(peak.value)} células-dia)."
        destaques.append(f"Pico: {fmt_month(peak.year, peak.month)}, {br_int(peak.value)} células-dia com detecção.")
    return _learn("calendario", ctx, cards, MONTH_NAO_DIZ + ["Antes de 2012 os valores são estimados a partir do MODIS."],
                  caveats(ctx, start, end),
                  [("ver", "Em quais meses as cores ficam mais fortes, ano após ano?"),
                   ("pensar", "O que acontece com a chuva no Cerrado nesses meses?"),
                   ("perguntar", "Se um mês ficou acima do que costuma ocorrer, que outra informação você "
                                 "buscaria para entender o porquê?")],
                  ["celula_dia", "percentil", "mes_parcial", "anomalia", "foco_de_calor", "omissao"],
                  ["13.3", "4.7", "4.4", "17.18"], alt, destaques, start, end)


def learn_summary(f: MonthFacts, ctx: Ctx, start: date, end: date, risk_available: bool) -> Learn:
    cards = month_cards(f, ctx)
    if not risk_available:
        cards.append(_card("prev.indisponivel", "contexto", "available == False", "Previsão", (
            "Ainda não há previsão para esta região. Preferimos não mostrar nada a mostrar um número que ainda "
            "não foi avaliado.")))
    alt = f"Resumo de {ctx.area_label}: {fmt_month(f.year, f.month)} ficou " \
          f"{CATEGORY_DESC.get(f.cat, 'sem comparação disponível')}."
    return _learn("resumo", ctx, cards, MONTH_NAO_DIZ, caveats(ctx, start, end),
                  [("ver", "Qual foi o último mês com dados e como ele se compara?"),
                   ("limite_do_dado", "Com quantos anos o mês foi comparado? Isso muda a sua confiança?"),
                   ("cidadania", "Como você contaria este resultado para vizinhos sem exagerar?")],
                  ["celula_dia", "anomalia", "mes_parcial", "nrt"], ["13.3", "4.7", "16.10"],
                  alt, [], start, end)


# ------------------------------------------------------------------ map (hexgrid)
def hex_facts(values: pd.Series) -> tuple[int, float, Optional[float]]:
    """n_cells, total, top10_share (share of the total in the top 10% cells; None if < 10 cells)."""
    v = values[values > 0].sort_values(ascending=False)
    n, tot = int(len(v)), float(v.sum())
    if n < 10 or tot <= 0:
        return n, tot, None
    k = max(1, math.ceil(0.1 * n))
    return n, tot, float(v.iloc[:k].sum() / tot)


def learn_hexgrid(ctx: Ctx, start: date, end: date, granularity: str, n_cells: int, total: float,
                  top10: Optional[float], centroid: Optional[tuple[float, float]], modis: int, viirs: int,
                  top_fire_days: Optional[int]) -> Learn:
    n = ctx.nivel
    ini, fim = fmt_date(start), fmt_date(end)
    cards: list[LearnCard] = []
    if n_cells == 0:
        cards.append(_card("mapa.vazio", "situacao", "n_cells == 0", "Nenhuma detecção registrada", (
            f"Nenhuma detecção registrada entre {ini} e {fim} nesta área. Isso não garante que não houve fogo: "
            f"nuvens, fumaça e o horário das passagens podem esconder focos.")))
    else:
        cards.append(_card("mapa.resumo", "situacao", "n_cells > 0", "O que o mapa mostra", pick(
            n, f"{br_int(n_cells)} hexágonos tiveram ao menos uma detecção de foco de calor entre {ini} e {fim}.",
            f"{br_int(n_cells)} hexágonos (cada um com cerca de {ctx.km2} km²) tiveram ao menos uma detecção de "
            f"foco de calor entre {ini} e {fim}, somando {br_num(total, 0)} células-dia com detecção.",
            f"n_cells = {br_int(n_cells)}; soma de células-dia harmonizadas = {br_num(total, 1)} "
            f"({start:%d/%m/%Y}–{end:%d/%m/%Y}, granularidade {granularity}).")))
        if top10 is not None and top10 >= 0.5:
            onde = f" A maior parte fica perto de {br_num(centroid[0], 1)}°, {br_num(centroid[1], 1)}°." if centroid else ""
            cards.append(_card("mapa.concentracao.alta", "situacao", "top10_share >= 0,5", "Concentração de focos", pick(
                n,
                f"Você está observando uma concentração de focos de calor: 1 em cada 10 hexágonos com detecção "
                f"reúne {pct(top10)} das células-dia do período.{onde} Isso pode indicar uma situação que merece "
                f"investigação, mas não significa que toda a área esteja em chamas. Os dados de satélite são "
                f"instrumentos de monitoramento e precisam ser interpretados junto com outras informações.",
                f"Você está observando uma concentração de focos de calor: os 10% de hexágonos mais ativos reúnem "
                f"{pct(top10)} das células-dia com detecção.{onde} Isso pode indicar uma situação que merece "
                f"investigação, mas não significa que toda a área esteja em chamas. Dados de satélite são "
                f"instrumentos de monitoramento e precisam ser interpretados junto com outras informações.",
                f"top10_share = {pct(top10)} (decil superior de {br_int(n_cells)} células).{onde} Concentração "
                f"espacial de detecções; não informa extensão do fogo nem causa."),
                "Peça aos alunos uma frase que descreva o mapa sem exagero e outra que exagere."))
        elif top10 is not None and top10 < 0.3:
            cards.append(_card("mapa.concentracao.dispersa", "situacao", "top10_share < 0,3", "Detecções espalhadas", (
                f"As detecções estão espalhadas por muitos hexágonos, sem um grande agrupamento "
                f"(os 10% mais ativos reúnem {pct(top10)} do total).")))
    if granularity == "month":
        cards.append(_card("mapa.mensal", "cautela", "granularity == 'month'", "Totais mensais", (
            "Para este período o mapa usa totais mensais, e o número de dias com detecção de cada hexágono é "
            "uma estimativa aproximada.")))
    if start < VIIRS_START:
        cards.append(_card("mapa.era_modis", "cautela", "start < 2012-01-20", "Período estimado", (
            "Antes de 2012, os valores são estimativas distribuídas entre os hexágonos onde o MODIS detectou algo. "
            "Por isso um hexágono pode passar de 1 por dia. Use para ver padrões, não para contar dias.")))
    if modis > 0 and viirs > 3 * modis:
        cards.append(_card("mapa.sensor", "contexto", "viirs_count > 3 × modis_count", "Dois sensores", pick(
            n, f"O VIIRS registrou {br_num(viirs / modis, 1)} vezes mais pontos que o MODIS. Ele enxerga fogos "
               f"menores, e esta contagem soma vários satélites VIIRS. Não houve mais fogo para um do que para o outro.",
            tecnico=f"viirs_count/modis_count = {br_num(viirs / modis, 1)}: pixel 375 m vs 1 km e soma de "
                    f"SNPP/NOAA-20/NOAA-21 nas contagens brutas (a série harmonizada usa um satélite de referência).")))
    dias = (end - start).days + 1
    if granularity == "day" and top_fire_days and top_fire_days >= 0.4 * dias:
        cards.append(_card("mapa.recorrencia", "contexto", "fire_days do hexágono mais ativo >= 40% dos dias",
                           "Detecção repetida", (
                               f"No hexágono mais ativo, algum satélite registrou detecção em {top_fire_days} dos "
                               f"{dias} dias do período. Detecção repetida no mesmo lugar merece atenção, mas o "
                               f"satélite não diz se é manejo, limpeza de pasto, desmatamento ou incêndio.")))
    alt = f"Mapa de hexágonos de {ctx.area_label}, de {ini} a {fim}: {br_int(n_cells)} hexágonos com ao menos " \
          f"uma detecção de foco de calor."
    destaques = [f"{pct(top10)} das células-dia nos 10% de hexágonos mais ativos."] if top10 is not None else []
    return _learn("mapa", ctx, cards, [
        f"A cor indica células-dia com ao menos uma detecção, não a extensão do fogo. Um único foco colore o "
        f"hexágono inteiro (cerca de {ctx.km2} km²).",
        "Hexágono sem cor não quer dizer que não houve fogo.",
        "O mapa não indica causa nem responsável."],
        caveats(ctx, start, end),
        [("ver", "O que você percebe sobre onde os focos se agrupam?"),
         ("perguntar", "Essas áreas são lavoura, pastagem ou vegetação nativa? Este sistema não responde isso. "
                       "Onde você buscaria?"),
         ("cidadania", "Como você comunicaria este mapa a vizinhos sem exagerar?")],
        ["h3", "celula_dia", "foco_de_calor", "omissao", "correlacao_causa", "area_queimada"],
        ["4.7", "13.3", "15.1", "16.10"], alt, destaques, start, end)


# ------------------------------------------------------------------ comparison
def ratio(a: Iterable[Optional[float]], b: Iterable[Optional[float]]) -> Optional[float]:
    """sum(a)/sum(b) over pairs where both exist and b > 0."""
    sa = sb = 0.0
    for x, y in zip(a, b):
        if x is not None and y is not None and y > 0:
            sa += x
            sb += y
    return sa / sb if sb > 0 else None


def learn_comparison(ctx: Ctx, start: date, end: date, r_cells: Optional[float], r_hotspots: Optional[float],
                     has_pre_viirs: bool, n_points: int) -> Learn:
    n = ctx.nivel
    cards: list[LearnCard] = []
    if r_cells is not None:
        if 1.8 <= r_cells <= 3.2:
            cards.append(_card("comp.razao", "situacao", "1,8 <= razão de células-dia <= 3,2", "Por que as linhas diferem", pick(
                n, f"Nos meses em que os dois satélites funcionaram, o VIIRS marcou cerca de {br_num(r_cells, 1)} vezes "
                   f"mais células-dia que o MODIS. Não houve mais fogo para um satélite do que para o outro: o VIIRS "
                   f"tem uma lente mais fina e enxerga fogos menores. Por isso não dá para emendar as duas séries sem ajuste.",
                tecnico=f"Razão VIIRS/MODIS de células-dia = {br_num(r_cells, 2)} no período comum (referência "
                        f"Matopiba 2012–2023: 2,3–2,6). Diferença de sensibilidade (375 m vs 1 km)."),
                "Pergunta-provocação: se um satélite novo vê o dobro de fogo, o fogo dobrou?"))
        else:
            motivos = ["nuvens e fumaça"]
            if end.year >= 2022:
                motivos.append("a mudança de órbita do MODIS a partir de 2022")
            if ctx.provisional_from and end >= ctx.provisional_from:
                motivos.append("dados provisórios")
            if n_points < 12:
                motivos.append("poucos meses comparados")
            if ctx.is_synthetic:
                motivos.append("o fato de esta ser uma amostra sintética")
            lista = ", ".join(motivos[:-1]) + (" ou " if len(motivos) > 1 else "") + motivos[-1]
            cards.append(_card("comp.razao_atipica", "situacao", "razão fora de 1,8–3,2", "Diferença fora do habitual", (
                f"Neste período, o VIIRS marcou {br_num(r_cells, 1)} vezes as células-dia do MODIS, fora do habitual "
                f"(de 2,3 a 2,6 vezes entre 2012 e 2023 no Matopiba). Possíveis motivos, não verificados: {lista}.")))
    if has_pre_viirs:
        cards.append(_card("comp.pre_viirs", "situacao" if r_cells is None else "cautela", "viirs_cell_days is None",
                           "Antes do VIIRS", "Antes de 2012 ainda não havia dados do VIIRS. Nesse trecho só há MODIS."))
    if r_cells and r_hotspots and r_hotspots > 1.3 * r_cells:
        cards.append(_card("comp.focos_vs_celulas", "cautela", "razão de focos > 1,3 × razão de células-dia",
                           "Focos e células-dia são unidades diferentes", (
                               "A contagem de focos do VIIRS soma vários satélites; a de células-dia usa só um satélite "
                               "de referência por dia. Somar satélites inflaria as contagens em cerca de 1,5 vez.")))
    if not cards:
        cards.append(_card("comp.vazio", "situacao", "sem meses comparáveis", "Sem comparação",
                           "Não há meses com os dois sensores neste período para comparar."))
    alt = f"Gráfico de linhas de {ctx.area_label}: células-dia do MODIS, do VIIRS e série harmonizada, " \
          f"{n_points} meses."
    destaques = [f"VIIRS/MODIS ≈ {br_num(r_cells, 1)}"] if r_cells else []
    return _learn("comparacao", ctx, cards, [
        "A diferença entre as linhas não mede fogo a mais; mede a sensibilidade de instrumentos diferentes.",
        "Focos e células-dia são unidades diferentes."], caveats(ctx, start, end),
        [("pensar", "Se um satélite novo vê o dobro de fogo, o fogo dobrou?"),
         ("perguntar", "Por que os cientistas escolhem um único satélite de referência?")],
        ["modis", "viirs", "resolucao", "celula_dia", "deteccao"], ["4.7", "4.4", "17.18"],
        alt, destaques, start, end)


# ------------------------------------------------------------------ harmonization
LIMITATIONS = [
    "A referência VIIRS usa um satélite por dia (Suomi NPP até 31/07/2026, depois NOAA-20 NRT); "
    "somar satélites inflaria as contagens em ~1,5× a partir de 2018.",
    "A calibração MODIS→VIIRS foi ajustada em 2012–2023; a deriva orbital do Terra/Aqua a partir de 2022 "
    "altera a sensibilidade do MODIS, por isso 2024+ não entra no ajuste (lá a série usa o VIIRS diretamente).",
    "Os dias mais recentes vêm de produtos NRT (tempo quase real) e podem mudar quando a NASA publicar o "
    "processamento padrão.",
    "Nuvens e fumaça escondem focos dos dois sensores ao mesmo tempo; a calibração não recupera fogo que "
    "nenhum satélite viu.",
    "Antes de 2012 a série é MODIS calibrado: incerteza maior do que no período VIIRS.",
    "Foco de calor não é área queimada: a unidade é a célula-dia (hexágono de ~36 km² com ao menos uma "
    "detecção), independente do número de focos ou do tamanho do fogo.",
    "Os satélites passam poucas vezes por dia; fogos curtos entre passagens e fogos pequenos ou sob copas "
    "densas podem não ser detectados.",
    "Percentis e categorias comparam com poucos anos do mesmo mês (mínimo 3); com n pequeno a posição é instável.",
]
LIMITATIONS_SIMPLES = [
    "Só um satélite VIIRS é usado por dia. Somar vários satélites faria parecer que houve mais fogo.",
    "O ajuste entre os sensores usa os anos de 2012 a 2023, quando as órbitas eram estáveis.",
    "Os dias mais recentes são provisórios e podem mudar.",
    "Nuvens e fumaça escondem focos de todos os satélites. Nenhum ajuste recupera o que ninguém viu.",
    "Antes de 2012 os valores são estimativas, com mais incerteza.",
    "Foco de calor não é área queimada: contamos hexágonos com detecção, não o tamanho do fogo.",
    "Os satélites passam poucas vezes por dia. Fogos curtos ou pequenos podem não aparecer.",
    "As comparações usam poucos anos. Com poucos anos, um único ano diferente muda muito o resultado.",
]


def learn_harmonization(ctx: Ctx, start: date, end: date, has_estimated: bool, has_measured: bool,
                        calibration_years: list[int], has_post_window: bool,
                        r2: Optional[float], rmse: Optional[float], bias: Optional[float],
                        rmse_raw: Optional[float], monthly_mean: Optional[float]) -> Learn:
    n = ctx.nivel
    cards: list[LearnCard] = []
    if has_estimated:
        cards.append(_card("harm.estimado", "situacao", "viirs_raw is None e modis_calibrated presente",
                           "Trecho estimado", pick(
                               n, "Antes de 2012, a linha é estimada: é o que o VIIRS provavelmente teria visto, "
                                  "calculado a partir do MODIS.",
                               tecnico="Antes de 2012: MODIS calibrado para a escala VIIRS (quantile mapping por mês)."),
                           "Equívoco comum: 'harmonizado = soma dos satélites'."))
    if has_measured:
        cards.append(_card("harm.medido", "situacao", "viirs_raw presente", "Trecho medido", (
            "Desde 2012, a linha usa diretamente o que o VIIRS registrou, com um satélite de referência por dia.")))
    if r2 is not None and rmse is not None:
        txt = pick(
            n, f"Para testar a estimativa, o projeto escondeu um ano por vez e tentou adivinhá-lo com os outros. "
               f"O ajuste explicou cerca de {pct(r2)} da variação de um mês para outro, com erro típico de "
               f"{br_num(rmse, 0)} células-dia por mês.",
            f"Validação deixando um ano de fora por vez: o ajuste explicou {pct(r2)} da variação mensal (R²) e o erro "
            f"típico (RMSE) foi de {br_num(rmse, 0)} células-dia por mês.",
            f"LOYO mensal ({ctx.method}): R² = {br_num(r2, 3)}, RMSE = {br_num(rmse, 1)}, viés = "
            f"{br_num(bias or 0, 1, sign=True)} células-dia/mês.")
        if rmse_raw:
            txt += f" Sem o ajuste (MODIS bruto), o erro típico seria de {br_num(rmse_raw, 0)}."
        cards.append(_card("harm.validacao", "contexto", "métrica loyo_monthly do método padrão",
                           "Como a estimativa foi testada", txt,
                           "Discuta: por que é honesto mostrar o erro junto com o resultado?"))
    if bias is not None and monthly_mean and abs(bias) > 0.05 * monthly_mean:
        cards.append(_card("harm.vies", "cautela", "|viés| > 5% da média mensal", "Tendência do erro", (
            f"Em média, a estimativa ficou {'abaixo' if bias < 0 else 'acima'} do valor medido em "
            f"{br_num(abs(bias), 0)} células-dia por mês.")))
    if has_post_window and calibration_years:
        a, b = calibration_years[0], calibration_years[-1]
        cards.append(_card("harm.janela", "cautela", "série inclui anos após a janela de calibração",
                           "Por que só alguns anos no ajuste", (
                               f"A partir de 2022 as órbitas dos satélites do MODIS mudaram, e ele passou a se "
                               f"comportar diferente. Por isso o ajuste usa só {a}–{b}. Nos anos recentes a linha não "
                               f"depende do ajuste, porque usa o VIIRS diretamente.")))
    alt = f"Gráfico da harmonização de {ctx.area_label}: MODIS bruto, MODIS calibrado, VIIRS e série harmonizada."
    return _learn("harmonizacao", ctx, cards, [
        "A calibração não recupera fogo que nenhum satélite viu.",
        "A série harmonizada não é a soma dos dois satélites.",
        "Antes de 2012 a incerteza é maior."], caveats(ctx, start, end),
        [("pensar", "Antes de 2012, a linha é medida ou estimada? Como foi testado se a estimativa é boa?"),
         ("limite_do_dado", "Por que é honesto mostrar o erro junto com o resultado?")],
        ["harmonizacao", "validacao", "metricas", "modis", "viirs"], ["17.18", "4.7", "4.4"],
        alt, [], start, end)


# ------------------------------------------------------------------ recent detections
def learn_recent(ctx: Ctx, start: date, end: date, n_det: int, n_sats: int, share_high: Optional[float],
                 top_hours: list[int], truncated: bool, days_without_data: list[date], has_frp: bool) -> Learn:
    n = ctx.nivel
    cards = [_card("rec.resumo", "situacao", "sempre", "O que estes pontos são", pick(
        n, f"{br_int(n_det)} detecções de {n_sats} satélites entre {fmt_date(start)} e {fmt_date(end)}. Cada ponto "
           f"marca o centro de um quadradinho de pelo menos 375 m (VIIRS) ou 1 km (MODIS), não a posição exata do fogo.",
        tecnico=f"{br_int(n_det)} detecções ({n_sats} satélites), {start:%d/%m/%Y}–{end:%d/%m/%Y}; coordenada = "
                f"centro do pixel (375 m VIIRS-I / 1 km MODIS no nadir, maior nas bordas da faixa)."))]
    if top_hours:
        horas = " e ".join(f"{h}h" for h in top_hours)
        cards.append(_card("rec.passagem", "situacao", "horas locais mais frequentes", "Por que nesses horários", (
            f"A maioria das detecções aconteceu por volta de {horas} (horário local). O satélite só registra o que "
            f"está quente no instante em que passa: um fogo que começou e apagou entre duas passagens não aparece."),
            "Pergunte: o que um fogo noturno curto teria de diferente?"))
    if share_high is not None:
        cards.append(_card("rec.confianca", "cautela", "sempre que houver detecções", "Confiança", (
            f"Só aparecem detecções com confiança nominal ou alta; as de confiança baixa são descartadas antes. "
            f"{pct(share_high)} destas têm confiança alta.")))
    if truncated:
        cards.append(_card("rec.truncado", "cautela", "truncated", "Lista parcial", (
            f"Mostrando só {br_int(n_det)} detecções para o mapa não ficar pesado. Baixe o CSV para ver todas.")))
    if days_without_data:
        d = days_without_data
        quando = fmt_date(d[0]) if len(d) == 1 else f"{len(d)} dias (o primeiro em {fmt_date(d[0])})"
        cards.append(_card("rec.dia_sem_obs", "cautela", "harmonized is None", "Dias sem dado", (
            f"Em {quando} não há dados de nenhum dos satélites para esta região. Ausência de dado não é ausência "
            f"de fogo.")))
    if has_frp:
        cards.append(_card("rec.frp", "contexto", "detecções com FRP", "Potência radiativa", (
            "A potência radiativa (em megawatts) mede quanta energia o fogo emitia no instante da passagem. "
            "Ela indica intensidade naquele momento, não o tamanho da área.")))
    alt = f"Mapa de pontos de {ctx.area_label}: {br_int(n_det)} detecções de foco de calor entre " \
          f"{fmt_date(start)} e {fmt_date(end)}."
    return _learn("recentes", ctx, cards, [
        "Não distingue queima agrícola, manejo, incêndio florestal ou outra fonte quente.",
        "Não indica o tamanho da área.",
        "Um ponto não é um incêndio."], caveats(ctx, start, end),
        [("ver", "Por que quase todas as detecções acontecem perto das mesmas horas?"),
         ("pensar", "O que um fogo noturno curto teria de diferente?")],
        ["deteccao", "passagem", "resolucao", "confianca", "frp", "nrt"], ["4.4", "13.3", "16.10"],
        alt, [], start, end)


# ------------------------------------------------------------------ forecast
def learn_forecast(ctx: Ctx, available: bool, horizon: int, n_cells: int, mean_prob: Optional[float]) -> Learn:
    if not available:
        cards = [_card("prev.indisponivel", "situacao", "available == False", "Previsão", (
            "Ainda não há previsão para esta região. Preferimos não mostrar nada a mostrar um número que ainda "
            "não foi avaliado."))]
        avisos = [Caveat(codigo="previsao_indisponivel", texto="Previsão de risco ainda não disponível.")]
        alt = f"Previsão para {ctx.area_label}: ainda não disponível."
    else:
        cards = [_card("prev.celula", "situacao", "available", "Como ler a probabilidade", (
            f"Cada hexágono (cerca de {ctx.km2} km²) mostra a probabilidade estimada de ao menos uma detecção de foco "
            f"de calor nos próximos {horizon} dias. Média entre os {br_int(n_cells)} hexágonos: "
            f"{pct(mean_prob or 0)}. Probabilidade não é certeza."))]
        avisos = []
        alt = f"Mapa de probabilidade de detecção nos próximos {horizon} dias, {br_int(n_cells)} hexágonos."
    return _learn("previsao", ctx, cards, [
        "Não diz se haverá incêndio, qual será o tamanho nem quem seria responsável.",
        "'Alto' não é 'vai acontecer'."], caveats(ctx, None, None) + avisos,
        [("pensar", "Se a probabilidade é 70% e não houve fogo, o modelo errou?")],
        ["probabilidade", "taxa_base", "deteccao"], ["13.3", "4.4", "17.18"], alt, [], None, None)


# ------------------------------------------------------------------ glossary & paths
@lru_cache
def _glossary_raw() -> dict:
    with open(CONTENT / "glossario.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)["termos"]


def glossary(nivel: str = "simples") -> list[GlossaryTerm]:
    return [GlossaryTerm(id=k, termo=v["termo"], definicao=v["tecnico"] if nivel == "tecnico" else v["simples"],
                         simples=v["simples"], tecnico=v["tecnico"], armadilha=v["armadilha"], ods=v["ods"])
            for k, v in _glossary_raw().items()]


@lru_cache
def _paths_raw() -> dict:
    with open(CONTENT / "trilhas.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)["trilhas"]


def learning_paths(region: str) -> list[LearningPath]:
    out = []
    for k, v in _paths_raw().items():
        etapas = [PathStep(ordem=i + 1, objetivo=e["objetivo"], view=e["view"], endpoint=e["endpoint"],
                           params={"region": region, **(e.get("params") or {})}, card_id=e["card_id"],
                           pergunta_saida=e["pergunta_saida"]) for i, e in enumerate(v.get("etapas") or [])]
        out.append(LearningPath(id=k, titulo=v["titulo"], publico=v["publico"], ods=v["ods"], bncc=v["bncc"],
                                bloqueada=bool(v.get("bloqueada")), motivo_bloqueio=v.get("motivo_bloqueio"),
                                etapas=etapas))
    return out
