"""Educational layer of the API: `learn` blocks (template text filled with the numbers on screen, no AI)
and the glossary. Three language levels (simples | estudante | tecnico) and two languages (pt | en).

Wording rule: "detecção de calor / foco de calor", never "incêndio confirmado".
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field

Nivel = Literal["simples", "estudante", "tecnico"]
Lang = Literal["pt", "en"]
PROVISIONAL_FROM = date(2026, 8, 1)   # NRT products from here on (Suomi NPP standard product ends 2026-07-31)

MESES = {"pt": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
                "outubro", "novembro", "dezembro"],
         "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                "October", "November", "December"]}


def fmt_int(v: float, lang: Lang) -> str:
    s = f"{v:,.0f}"
    return s.replace(",", ".") if lang == "pt" else s


def fmt_num(v: float, nd: int, lang: Lang, sign: bool = False) -> str:
    s = f"{v:+,.{nd}f}" if sign else f"{v:,.{nd}f}"
    if lang == "pt":
        s = s.replace(",", "§").replace(".", ",").replace("§", ".")
    return s.replace("-", "−")


def month_label(year: int, month: int, lang: Lang) -> str:
    m = MESES[lang][month - 1]
    return f"{m} de {year}" if lang == "pt" else f"{m} {year}"


# ------------------------------------------------------------------ schemas
class LearnCard(BaseModel):
    slot: Literal["situacao", "cautela", "contexto"]
    titulo: str
    texto: str


class OdsTarget(BaseModel):
    meta: str = Field(description="UN SDG target code, e.g. 13.1")
    texto: str


class Procedencia(BaseModel):
    fonte: str
    provisional_from: date
    metodo: str
    gerado_em: datetime


class Learn(BaseModel):
    view: Literal["mapa", "calendario", "harmonizacao", "previsao"]
    nivel: Nivel
    lang: Lang
    avisos: list[str] = []
    cards: list[LearnCard]
    nao_diz: list[str]
    para_pensar: list[str]
    ods: list[OdsTarget]
    procedencia: Procedencia


class GlossaryTerm(BaseModel):
    id: str
    termo: str
    definicao: str = Field(description="text at the requested level")
    simples: str
    tecnico: str
    armadilha: str = Field(description="common misreading")
    ods: list[str] = []


# ------------------------------------------------------------------ helpers
def _pick(texts: dict, nivel: Nivel, lang: Lang) -> str:
    """texts = {lang: {nivel: str}} or {lang: str} (same at every level)."""
    t = texts[lang]
    return t if isinstance(t, str) else t[nivel]


def _proc(lang: Lang) -> Procedencia:
    return Procedencia(
        fonte="NASA FIRMS (MODIS C6.1, VIIRS 375 m)",
        provisional_from=PROVISIONAL_FROM,
        metodo=("Texto montado a partir dos números exibidos, sem inteligência artificial." if lang == "pt"
                else "Text assembled from the numbers shown, without artificial intelligence."),
        gerado_em=datetime.now(timezone.utc).replace(microsecond=0))


ODS = {
    "pt": [OdsTarget(meta="13.1", texto="Fortalecer a resiliência e a capacidade de adaptação a riscos climáticos e desastres."),
           OdsTarget(meta="15.1", texto="Conservar e usar de forma sustentável os ecossistemas terrestres, como o Cerrado."),
           OdsTarget(meta="11.5", texto="Reduzir o número de pessoas afetadas por desastres.")],
    "en": [OdsTarget(meta="13.1", texto="Strengthen resilience and adaptive capacity to climate-related hazards and disasters."),
           OdsTarget(meta="15.1", texto="Conserve and sustainably use terrestrial ecosystems such as the Cerrado."),
           OdsTarget(meta="11.5", texto="Reduce the number of people affected by disasters.")],
}

NAO_DIZ = {
    "pt": ["Não diz quanta área queimou: uma célula-dia é um hexágono de ~36 km² com ao menos uma detecção.",
           "Não confirma incêndio: o satélite detecta calor, que pode ser queimada controlada, incêndio ou outra fonte.",
           "Não mostra o fogo escondido por nuvens, fumaça ou que aconteceu entre as passagens do satélite.",
           "Não diz a causa do fogo nem quem o provocou."],
    "en": ["It does not say how much area burned: a cell-day is a ~36 km² hexagon with at least one detection.",
           "It does not confirm a fire: the satellite detects heat, which may be a controlled burn, a wildfire or another source.",
           "It does not show fire hidden by clouds or smoke, or fire that happened between satellite overpasses.",
           "It does not say what caused the fire or who started it."],
}

PROVISIONAL_WARN = {
    "pt": "Dados a partir de 01/08/2026 vêm de produtos em tempo quase real (NRT) e podem mudar.",
    "en": "Data from 08/01/2026 come from near-real-time (NRT) products and may change.",
}


# ------------------------------------------------------------------ per view
def learn_map(*, nivel: Nivel, lang: Lang, region_name: str, start: date, end: date, n_cells: int,
              top_value: float | None, granularity: str, custom: bool) -> Learn:
    where = ("a área desenhada" if custom else region_name) if lang == "pt" else ("the drawn area" if custom else region_name)
    d1, d2 = (start.strftime("%d/%m/%Y"), end.strftime("%d/%m/%Y")) if lang == "pt" else (start.strftime("%m/%d/%Y"), end.strftime("%m/%d/%Y"))
    n = fmt_int(n_cells, lang)
    top = fmt_num(top_value or 0, 1, lang)
    cards = [
        LearnCard(slot="situacao", titulo="O que o mapa mostra" if lang == "pt" else "What the map shows", texto=_pick({
            "pt": {"simples": f"Entre {d1} e {d2}, {n} hexágonos de {where} tiveram pelo menos um foco de calor visto por satélite. Cores mais claras = mais dias com foco.",
                   "estudante": f"De {d1} a {d2}, {n} hexágonos H3 (~36 km²) em {where} somaram células-dia com detecção. O mais ativo chegou a {top} células-dia.",
                   "tecnico": f"{n} células H3 res 6 com valor > 0 em {where}, {d1}–{d2}; máximo {top} células-dia harmonizadas (escala VIIRS); granularidade {'diária' if granularity == 'day' else 'mensal'}."},
            "en": {"simples": f"From {d1} to {d2}, {n} hexagons in {where} had at least one heat hotspot seen by satellite. Lighter colors = more days with hotspots.",
                   "estudante": f"From {d1} to {d2}, {n} H3 hexagons (~36 km²) in {where} added up cell-days with detection. The most active reached {top} cell-days.",
                   "tecnico": f"{n} H3 res-6 cells with value > 0 in {where}, {d1}–{d2}; max {top} harmonized cell-days (VIIRS scale); {'daily' if granularity == 'day' else 'monthly'} granularity."},
        }, nivel, lang)),
        LearnCard(slot="cautela", titulo="Cuidado ao concluir" if lang == "pt" else "Careful before concluding", texto=_pick({
            "pt": {"simples": "Hexágono sem cor não quer dizer que não teve fogo: nuvens e fumaça escondem focos.",
                   "estudante": "As cores são classes relativas (quantis) dos hexágonos mostrados: mudar o período muda os limites da legenda.",
                   "tecnico": "Classes por quantil sobre os valores desenhados; ausência de detecção ≠ ausência de fogo (cobertura de nuvens, horário de passagem, limiar de detecção)."},
            "en": {"simples": "A hexagon with no color does not mean there was no fire: clouds and smoke hide hotspots.",
                   "estudante": "Colors are relative classes (quantiles) of the hexagons shown: changing the period changes the legend limits.",
                   "tecnico": "Quantile classes over the drawn values; no detection ≠ no fire (cloud cover, overpass time, detection threshold)."},
        }, nivel, lang)),
        LearnCard(slot="contexto", titulo="Por que hexágonos" if lang == "pt" else "Why hexagons", texto=_pick({
            "pt": {"simples": "Dividimos o mapa em hexágonos iguais para comparar lugares de forma justa.",
                   "estudante": "A grade H3 tem células de área quase igual; contar dias com detecção por célula evita contar o mesmo fogo várias vezes.",
                   "tecnico": "Grade H3 (Uber) res 6, ~36 km²; a unidade célula-dia neutraliza a diferença de pixel MODIS (1 km) × VIIRS (375 m)."},
            "en": {"simples": "We split the map into equal hexagons to compare places fairly.",
                   "estudante": "The H3 grid has cells of nearly equal area; counting days with detection per cell avoids counting the same fire several times.",
                   "tecnico": "Uber H3 grid, res 6, ~36 km²; the cell-day unit neutralizes the MODIS (1 km) × VIIRS (375 m) pixel difference."},
        }, nivel, lang)),
    ]
    think = {"pt": ["Por que alguns hexágonos se repetem como mais ativos ano após ano?",
                    "O que muda no mapa se você olhar só a estação seca (julho a outubro)?"],
             "en": ["Why do some hexagons show up as the most active year after year?",
                    "What changes on the map if you look only at the dry season (July to October)?"]}[lang]
    avisos = [PROVISIONAL_WARN[lang]] if end >= PROVISIONAL_FROM else []
    return Learn(view="mapa", nivel=nivel, lang=lang, avisos=avisos, cards=cards, nao_diz=NAO_DIZ[lang],
                 para_pensar=think, ods=ODS[lang], procedencia=_proc(lang))


def learn_calendar(*, nivel: Nivel, lang: Lang, region_name: str, peak: tuple[int, int, float] | None,
                   current: dict | None, end: date) -> Learn:
    cards = []
    if peak:
        y, m, v = peak
        ml, vv = month_label(y, m, lang), fmt_int(v, lang)
        cards.append(LearnCard(slot="situacao", titulo="O mês mais intenso" if lang == "pt" else "The most intense month", texto=_pick({
            "pt": {"simples": f"O mês com mais focos no período foi {ml}, com {vv} células-dia com detecção.",
                   "estudante": f"{ml.capitalize()} teve o maior total do período: {vv} células-dia (hexágono × dia com ao menos uma detecção).",
                   "tecnico": f"Máximo do período: {ml}, {vv} células-dia harmonizadas (escala VIIRS; antes de 2012, MODIS calibrado por quantis)."},
            "en": {"simples": f"The month with the most hotspots in the period was {ml}, with {vv} cell-days with detection.",
                   "estudante": f"{ml} had the highest total of the period: {vv} cell-days (hexagon × day with at least one detection).",
                   "tecnico": f"Period maximum: {ml}, {vv} harmonized cell-days (VIIRS scale; before 2012, quantile-calibrated MODIS)."},
        }, nivel, lang)))
    if current and current.get("sentence"):
        cards.append(LearnCard(slot="situacao", titulo="E agora?" if lang == "pt" else "And now?", texto=current["sentence"]))
    cards.append(LearnCard(slot="cautela", titulo="Mês incompleto" if lang == "pt" else "Incomplete month", texto=_pick({
        "pt": {"simples": "O mês atual ainda não acabou: compare só com os mesmos dias dos outros anos.",
               "estudante": "Meses hachurados estão incompletos; a comparação usa apenas os mesmos dias nos anos anteriores, para ser justa.",
               "tecnico": "Mês parcial: desvio e percentil calculados sobre os dias 1..d de cada ano de referência (anos completos anteriores)."},
        "en": {"simples": "The current month is not over yet: compare it only with the same days in other years.",
               "estudante": "Hatched months are incomplete; the comparison uses only the same days in previous years, to be fair.",
               "tecnico": "Partial month: deviation and percentile computed over days 1..d of each reference year (previous complete years)."},
    }, nivel, lang)))
    cards.append(LearnCard(slot="contexto", titulo="Estação seca" if lang == "pt" else "Dry season", texto=_pick({
        "pt": {"simples": "No Cerrado, a maior parte dos focos aparece entre julho e outubro, quando chove pouco.",
               "estudante": "O padrão sazonal (pico em agosto–setembro) vem da estação seca e do manejo agrícola com fogo.",
               "tecnico": "Sazonalidade marcada (pico ago–set) ligada à estação seca e ao uso do fogo no manejo; anomalias devem ser lidas contra o mesmo mês."},
        "en": {"simples": "In the Cerrado, most hotspots appear between July and October, when it rarely rains.",
               "estudante": "The seasonal pattern (peak in August–September) comes from the dry season and agricultural fire use.",
               "tecnico": "Strong seasonality (Aug–Sep peak) tied to the dry season and fire use in land management; read anomalies against the same month."},
    }, nivel, lang)))
    think = {"pt": ["O ano de 2012 parece diferente dos outros? Por quê? (dica: veja a aba Harmonização)",
                    "Os meses de pico mudaram de lugar ao longo das décadas?"],
             "en": ["Does 2012 look different from the other years? Why? (hint: see the Harmonization tab)",
                    "Have the peak months shifted over the decades?"]}[lang]
    avisos = [PROVISIONAL_WARN[lang]] if end >= PROVISIONAL_FROM else []
    return Learn(view="calendario", nivel=nivel, lang=lang, avisos=avisos, cards=cards, nao_diz=NAO_DIZ[lang],
                 para_pensar=think, ods=ODS[lang], procedencia=_proc(lang))


def learn_harmonization(*, nivel: Nivel, lang: Lang, r2_daily: float | None, r2_monthly: float | None,
                        calib: list[int]) -> Learn:
    a, b = (calib + [None, None])[:2]
    r2d = fmt_num(r2_daily, 2, lang) if r2_daily is not None else "—"
    r2m = fmt_num(r2_monthly, 2, lang) if r2_monthly is not None else "—"
    cards = [
        LearnCard(slot="situacao", titulo="Dois satélites, uma série" if lang == "pt" else "Two satellites, one series", texto=_pick({
            "pt": {"simples": "O satélite novo (VIIRS) enxerga mais focos que o antigo (MODIS). Ajustamos o antigo para os dois falarem a mesma língua.",
                   "estudante": f"O MODIS foi ajustado à escala do VIIRS com os anos em que os dois funcionaram juntos ({a}–{b}).",
                   "tecnico": f"Mapeamento de quantis mensal MODIS→VIIRS calibrado em {a}–{b}; validação deixando um ano de fora: R² diário {r2d}, mensal {r2m}."},
            "en": {"simples": "The newer satellite (VIIRS) sees more hotspots than the older one (MODIS). We adjust the older one so both speak the same language.",
                   "estudante": f"MODIS was adjusted to the VIIRS scale using the years when both worked together ({a}–{b}).",
                   "tecnico": f"Monthly MODIS→VIIRS quantile mapping calibrated on {a}–{b}; leave-one-year-out validation: daily R² {r2d}, monthly {r2m}."},
        }, nivel, lang)),
        LearnCard(slot="cautela", titulo="O ajuste não é perfeito" if lang == "pt" else "The adjustment is not perfect", texto=_pick({
            "pt": {"simples": "Antes de 2012 os números são uma estimativa: há mais incerteza.",
                   "estudante": f"O ajuste acerta bem o total do mês (R² {r2m}), mas erra mais no dia a dia (R² {r2d}).",
                   "tecnico": "Em meses de transição (mar–abr) o R² por mês do ano fica perto de zero; fora da janela (2024+) a deriva orbital do MODIS degrada o ajuste."},
            "en": {"simples": "Before 2012 the numbers are an estimate: there is more uncertainty.",
                   "estudante": f"The adjustment matches the monthly total well (R² {r2m}) but misses more day to day (R² {r2d}).",
                   "tecnico": "In transition months (Mar–Apr) the per-month R² is near zero; outside the window (2024+) MODIS orbital drift degrades the fit."},
        }, nivel, lang)),
        LearnCard(slot="contexto", titulo="Por que isso importa" if lang == "pt" else "Why it matters", texto=_pick({
            "pt": {"simples": "Sem o ajuste, parece que o fogo dobrou em 2012 — mas foi só o satélite novo chegando.",
                   "estudante": "Somar MODIS e VIIRS cria um salto falso em 2012; a série harmonizada permite comparar 2005 com 2025.",
                   "tecnico": "A série harmonizada remove a quebra estrutural de 2012 e permite tendências e anomalias de longo prazo com uma única escala."},
            "en": {"simples": "Without the adjustment, fire seems to double in 2012 — but it was only the new satellite arriving.",
                   "estudante": "Adding MODIS and VIIRS creates a false jump in 2012; the harmonized series lets you compare 2005 with 2025.",
                   "tecnico": "The harmonized series removes the 2012 structural break and enables long-term trends and anomalies on a single scale."},
        }, nivel, lang)),
    ]
    think = {"pt": ["Por que um sensor com pixel menor detecta mais focos?", "Como você testaria se o ajuste funciona?"],
             "en": ["Why does a sensor with a smaller pixel detect more hotspots?", "How would you test whether the adjustment works?"]}[lang]
    return Learn(view="harmonizacao", nivel=nivel, lang=lang, cards=cards, nao_diz=NAO_DIZ[lang],
                 para_pensar=think, ods=ODS[lang], procedencia=_proc(lang))


def learn_forecast(*, nivel: Nivel, lang: Lang, available: bool, n_high: int, n_very_high: int,
                   pr_auc: float | None, clim_pr_auc: float | None, forecast_date: date | None) -> Learn:
    nh = fmt_int(n_high + n_very_high, lang)
    pa = fmt_num(pr_auc, 2, lang) if pr_auc is not None else "—"
    pc = fmt_num(clim_pr_auc, 2, lang) if clim_pr_auc is not None else "—"
    if available:
        sit = {"pt": {"simples": f"O modelo aponta {nh} hexágonos com chance alta ou muito alta de ter foco de calor nos próximos 7 dias.",
                      "estudante": f"{nh} hexágonos ficaram nas classes alto (30–60%) ou muito alto (≥ 60%) de probabilidade de ao menos uma detecção em 7 dias.",
                      "tecnico": f"{nh} células com p ≥ 0,30 (LightGBM calibrado por isotônica); PR-AUC no teste {pa} vs. climatologia {pc}."},
               "en": {"simples": f"The model points to {nh} hexagons with a high or very high chance of a heat hotspot in the next 7 days.",
                      "estudante": f"{nh} hexagons fell in the high (30–60%) or very high (≥ 60%) classes of probability of at least one detection in 7 days.",
                      "tecnico": f"{nh} cells with p ≥ 0.30 (isotonic-calibrated LightGBM); test PR-AUC {pa} vs. climatology {pc}."}}
    else:
        sit = {"pt": "Ainda não há previsão de modelo avaliado para esta região; o mapa mostra a climatologia (com que frequência houve foco no mesmo mês).",
               "en": "There is no evaluated model forecast for this region yet; the map shows climatology (how often there was a hotspot in the same month)."}
    cards = [
        LearnCard(slot="situacao", titulo="O que a previsão diz" if lang == "pt" else "What the forecast says", texto=_pick(sit, nivel, lang)),
        LearnCard(slot="cautela", titulo="Probabilidade, não certeza" if lang == "pt" else "Probability, not certainty", texto=_pick({
            "pt": {"simples": "30% quer dizer que, em 10 lugares assim, cerca de 3 terão foco. Não é garantia.",
                   "estudante": "As probabilidades foram calibradas: entre os hexágonos marcados com 30%, cerca de 30% tiveram detecção no teste.",
                   "tecnico": "Calibração isotônica no bloco de validação (ECE ≈ 0,003 no teste); o modelo não usa chuva, umidade nem vento."},
            "en": {"simples": "30% means that, out of 10 places like this, about 3 will have a hotspot. It is not a guarantee.",
                   "estudante": "The probabilities are calibrated: among hexagons marked 30%, about 30% had a detection in the test.",
                   "tecnico": "Isotonic calibration on the validation block (test ECE ≈ 0.003); the model uses no rain, humidity or wind."},
        }, nivel, lang)),
        LearnCard(slot="contexto", titulo="Comparado a quê?" if lang == "pt" else "Compared with what?", texto=_pick({
            "pt": {"simples": "Testamos o modelo contra regras simples, como 'vai acontecer o mesmo que nos outros anos'. Ele se saiu melhor.",
                   "estudante": f"O modelo é avaliado contra persistência e climatologia em anos que ele nunca viu (2023–2026): PR-AUC {pa} vs. {pc}.",
                   "tecnico": f"Split temporal: treino 2017–2019, validação 2020–2022, teste 2023–2026; PR-AUC {pa} (climatologia {pc})."},
            "en": {"simples": "We tested the model against simple rules, like 'the same will happen as in other years'. It did better.",
                   "estudante": f"The model is evaluated against persistence and climatology on years it never saw (2023–2026): PR-AUC {pa} vs. {pc}.",
                   "tecnico": f"Temporal split: train 2017–2019, validation 2020–2022, test 2023–2026; PR-AUC {pa} (climatology {pc})."},
        }, nivel, lang)),
    ]
    think = {"pt": ["Que dados (chuva? vento?) poderiam melhorar a previsão?", "Por que avaliar o modelo em anos que ele não viu?"],
             "en": ["What data (rain? wind?) could improve the forecast?", "Why evaluate the model on years it has not seen?"]}[lang]
    return Learn(view="previsao", nivel=nivel, lang=lang, cards=cards, nao_diz=NAO_DIZ[lang], para_pensar=think,
                 ods=ODS[lang], procedencia=_proc(lang))


# ------------------------------------------------------------------ glossary
_G = [
    ("foco", {"pt": ("Foco de calor", "Ponto onde um satélite detectou temperatura bem acima do entorno.",
                     "Um lugar quente visto do espaço.",
                     "Pixel classificado como anomalia térmica pelo algoritmo contextual de detecção ativa (MODIS MOD14/MYD14, VIIRS VNP14IMG).",
                     "Foco de calor não é incêndio confirmado: pode ser queimada controlada, fogueira ou superfície industrial quente."),
              "en": ("Heat hotspot", "Point where a satellite detected a temperature well above its surroundings.",
                     "A hot place seen from space.",
                     "Pixel flagged as a thermal anomaly by the contextual active-fire algorithm (MODIS MOD14/MYD14, VIIRS VNP14IMG).",
                     "A hotspot is not a confirmed fire: it may be a controlled burn, a campfire or a hot industrial surface.")}, ["13.1", "15.1"]),
    ("celula_dia", {"pt": ("Célula-dia", "Um hexágono H3 de ~36 km² que teve ao menos uma detecção em um dia.",
                           "Um pedaço do mapa que teve foco naquele dia.",
                           "Par (célula H3 res 6, data) com ≥ 1 detecção após filtros de qualidade; unidade da série harmonizada.",
                           "Célula-dia não é área queimada: o hexágono inteiro conta, mesmo que o fogo tenha sido pequeno."),
                    "en": ("Cell-day", "One ~36 km² H3 hexagon that had at least one detection on a day.",
                           "A piece of the map that had a hotspot that day.",
                           "(H3 res-6 cell, date) pair with ≥ 1 detection after quality filters; the unit of the harmonized series.",
                           "A cell-day is not burned area: the whole hexagon counts, even if the fire was small.")}, []),
    ("modis", {"pt": ("MODIS", "Sensor dos satélites Terra e Aqua (desde 2000/2002), com pixel de ~1 km.",
                      "O satélite mais antigo, que enxerga em quadrados de 1 km.",
                      "Moderate Resolution Imaging Spectroradiometer; produto de fogo ativo C6.1, 1 km no nadir, 4 passagens/dia nos trópicos.",
                      "Os satélites do MODIS estão em fim de vida (deriva orbital), o que muda a hora de passagem e a sensibilidade."),
               "en": ("MODIS", "Sensor on the Terra and Aqua satellites (since 2000/2002), with a ~1 km pixel.",
                      "The older satellite, which sees in 1 km squares.",
                      "Moderate Resolution Imaging Spectroradiometer; C6.1 active-fire product, 1 km at nadir, 4 overpasses/day in the tropics.",
                      "The MODIS satellites are near end of life (orbital drift), which changes overpass time and sensitivity.")}, []),
    ("viirs", {"pt": ("VIIRS", "Sensor dos satélites Suomi NPP, NOAA-20 e NOAA-21 (desde 2012), com pixel de 375 m.",
                      "O satélite mais novo, que enxerga detalhes menores.",
                      "Visible Infrared Imaging Radiometer Suite, banda I (375 m); detecta focos menores e mais focos por evento que o MODIS.",
                      "Mais focos VIIRS não significa mais fogo: o sensor é mais sensível."),
               "en": ("VIIRS", "Sensor on the Suomi NPP, NOAA-20 and NOAA-21 satellites (since 2012), with a 375 m pixel.",
                      "The newer satellite, which sees smaller details.",
                      "Visible Infrared Imaging Radiometer Suite, I-band (375 m); detects smaller hotspots and more hotspots per event than MODIS.",
                      "More VIIRS hotspots do not mean more fire: the sensor is more sensitive.")}, []),
    ("harmonizacao", {"pt": ("Harmonização", "Ajuste que coloca MODIS e VIIRS na mesma escala para formar uma série única.",
                             "Fazer os dois satélites contarem do mesmo jeito.",
                             "Mapeamento de quantis mensal MODIS→VIIRS, calibrado nos anos de sobreposição e validado deixando um ano de fora.",
                             "A harmonização reduz o salto de 2012, mas não o elimina, e não recupera fogo que nenhum satélite viu."),
                      "en": ("Harmonization", "Adjustment that puts MODIS and VIIRS on the same scale to form a single series.",
                             "Making both satellites count the same way.",
                             "Monthly MODIS→VIIRS quantile mapping, calibrated on overlap years and validated leave-one-year-out.",
                             "Harmonization reduces the 2012 jump but does not remove it, and cannot recover fire no satellite saw.")}, []),
    ("frp", {"pt": ("FRP (potência radiativa do fogo)", "Energia emitida pelo fogo, em megawatts, estimada pelo satélite.",
                    "O quanto o fogo está 'brilhando' de calor.",
                    "Fire Radiative Power (MW), derivado da radiância no infravermelho médio; proxy da taxa de queima de biomassa.",
                    "FRP de MODIS e VIIRS não são diretamente comparáveis (pixels diferentes); por isso as classes são por sensor."),
             "en": ("FRP (fire radiative power)", "Energy emitted by the fire, in megawatts, estimated by the satellite.",
                    "How much the fire is 'glowing' with heat.",
                    "Fire Radiative Power (MW), derived from mid-infrared radiance; a proxy for biomass burning rate.",
                    "MODIS and VIIRS FRP are not directly comparable (different pixels); that is why classes are per sensor.")}, []),
    ("h3", {"pt": ("Hexágono H3", "Grade de hexágonos que cobre o planeta; aqui usamos a resolução 6 (~36 km²).",
                   "Um mapa dividido em favos de mel iguais.",
                   "Índice geoespacial hierárquico H3 (Uber), res 6; células quase equivalentes em área, com pais nas resoluções 5 e 4.",
                   "Ao afastar o mapa, hexágonos menores são somados em hexágonos maiores: o valor muda de escala."),
            "en": ("H3 hexagon", "Hexagon grid covering the planet; here we use resolution 6 (~36 km²).",
                   "A map divided into equal honeycomb cells.",
                   "Uber H3 hierarchical geospatial index, res 6; near-equal-area cells, with parents at resolutions 5 and 4.",
                   "When you zoom out, small hexagons are summed into larger ones: the value changes scale.")}, []),
    ("anomalia", {"pt": ("Anomalia", "Quanto um mês ficou acima ou abaixo do normal para aquele mês do ano.",
                         "Se o mês teve mais ou menos focos que o costume.",
                         "Desvio percentual e percentil vs. o mesmo mês nos anos anteriores completos (mínimo 3); z-score sobre log1p.",
                         "Comparar setembro com março não faz sentido: a anomalia sempre compara o mesmo mês."),
                  "en": ("Anomaly", "How far a month was above or below normal for that month of the year.",
                         "Whether the month had more or fewer hotspots than usual.",
                         "Percent deviation and percentile vs. the same month in previous complete years (minimum 3); z-score on log1p.",
                         "Comparing September with March makes no sense: the anomaly always compares the same month.")}, ["13.1"]),
    ("nrt", {"pt": ("Tempo quase real (NRT)", "Dados entregues em poucas horas, antes do processamento final.",
                    "Dados rápidos, que ainda podem ser corrigidos.",
                    "Near Real-Time (LANCE), latência ≤ 3 h; substituído depois pelo produto padrão (SP), que pode diferir.",
                    "Os últimos meses podem mudar quando a NASA publicar o produto padrão."),
             "en": ("Near real time (NRT)", "Data delivered within a few hours, before final processing.",
                    "Fast data that may still be corrected.",
                    "Near Real-Time (LANCE), latency ≤ 3 h; later replaced by the standard product (SP), which may differ.",
                    "The last months may change when NASA publishes the standard product.")}, []),
    ("coincidente", {"pt": ("Coincidente", "Célula e dia em que MODIS e VIIRS detectaram calor.",
                            "Quando os dois satélites viram foco no mesmo lugar e dia.",
                            "Célula-dia com modis_count > 0 e viirs_count > 0; no mapa de densidade, no período (não necessariamente no mesmo dia).",
                            "Coincidente não significa o mesmo evento de fogo."),
                     "en": ("Coincident", "Cell and day when both MODIS and VIIRS detected heat.",
                            "When both satellites saw a hotspot at the same place and day.",
                            "Cell-day with modis_count > 0 and viirs_count > 0; on the density map, within the period (not necessarily the same day).",
                            "Coincident does not mean the same fire event.")}, []),
]


def glossary(nivel: Nivel, lang: Lang) -> list[GlossaryTerm]:
    out = []
    for gid, texts, ods in _G:
        termo, definicao, simples, tecnico, armadilha = texts[lang]
        text = {"simples": simples, "estudante": definicao, "tecnico": tecnico}[nivel]
        out.append(GlossaryTerm(id=gid, termo=termo, definicao=text, simples=simples, tecnico=tecnico,
                                armadilha=armadilha, ods=ods))
    return out


LIMITATIONS_SIMPLE = {
    "pt": ["Satélite vê calor, não confirma incêndio.",
           "Nuvens e fumaça escondem focos.",
           "Antes de 2012 os números são estimativas a partir do satélite antigo.",
           "Os últimos meses podem mudar (dados provisórios)."],
    "en": ["Satellites see heat; they do not confirm fires.",
           "Clouds and smoke hide hotspots.",
           "Before 2012 the numbers are estimates from the older satellite.",
           "The last months may change (provisional data)."],
}


def opt_learn(enabled: bool, build) -> Optional[Learn]:
    return build() if enabled else None
