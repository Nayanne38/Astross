"""Calendário de Queimadas API.

Run: python tasks.py api   (http://localhost:8000/docs)
All data endpoints accept: region, start, end (YYYY-MM-DD), and optionally bbox
('west,south,east,north') or polygon ('lon,lat;lon,lat;...' or a GeoJSON Polygon).
"""
from __future__ import annotations

import io
import logging
import math
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from api import alerts as alerts_api, edu, llm, queries as q, telegram_hook
from api.schemas import (WorldRegionCount, WorldResponse, Anomaly, CalendarCell, CalendarResponse, CalibrationMetric, ComparisonPoint,
                         ComparisonResponse, Detection, ForecastCell, ForecastResponse, HarmonizationPoint,
                         HarmonizationResponse, Health, HexCell, HexGridResponse, Meta, RecentDay,
                         RecentResponse, Region, RiskSummary, Summary, ForecastInsight,
                         ClimatologyFallback, Comparison, FallbackCell)
from etl.config import get_region, regions, settings
from etl.load import db

log = logging.getLogger("api")
ATTRIBUTION = ("Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS), "
               "parte do NASA LANCE e do ESDIS. https://earthdata.nasa.gov/firms")
ATTRIBUTION_EN = ("We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management "
                  "System (FIRMS), part of NASA LANCE and ESDIS. https://earthdata.nasa.gov/firms")
UNIT = "células-dia com fogo (H3 res {res}, escala VIIRS-equivalente)"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
         "outubro", "novembro", "dezembro"]
FORECAST_DISCLAIMER = ("Previsão de risco: probabilidade estimada por modelo estatístico, não certeza. "
                       "Consulte as métricas de avaliação e as limitações.")
FORECAST_DISCLAIMER_EN = ("Risk forecast: probability estimated by a statistical model, not certainty. "
                          "See the evaluation metrics and the limitations.")

app = FastAPI(title="Calendário de Queimadas API", version="0.5.0",
              description="Harmonized MODIS/VIIRS active-fire data (NASA FIRMS). " + ATTRIBUTION)
app.add_middleware(CORSMiddleware,
                   allow_origins=[o.strip() for o in os.getenv("API_CORS_ORIGINS", "http://localhost:3000").split(",")],
                   allow_methods=["GET", "POST"], allow_headers=["*"],
                   expose_headers=["Content-Disposition", "X-Row-Count"])
app.add_middleware(GZipMiddleware, minimum_size=2000)
app.include_router(alerts_api.router)
app.include_router(telegram_hook.router)


# ------------------------------------------------------------------ common params
class Area:
    def __init__(self,
                 region: Optional[str] = Query(None, description="region key (config/regions.yaml)"),
                 start: Optional[date] = Query(None, description="YYYY-MM-DD (default: start of record)"),
                 end: Optional[date] = Query(None, description="YYYY-MM-DD (default: end of record)"),
                 bbox: Optional[str] = Query(None, description="west,south,east,north"),
                 polygon: Optional[str] = Query(None, description="lon,lat;lon,lat;... or GeoJSON Polygon")):
        try:
            rg = get_region(region)
            self.region = rg.key
        except SystemExit as e:
            raise HTTPException(404, str(e))
        self.lite = False
        if rg.live:
            if not q.coverage(rg.key)["data_end"]:
                raise HTTPException(409, f"region '{rg.key}' has no history loaded yet: use GET /live")
            self.lite = True
            if bbox or polygon:
                raise HTTPException(409, f"region '{rg.key}' has regional history only (no per-cell data): area filters are unavailable")
        try:
            b = q.parse_bbox(bbox)
            p = q.parse_polygon(polygon)
        except (ValueError, KeyError) as e:
            raise HTTPException(422, f"invalid area filter: {e}")
        cov = q.coverage(self.region)
        if cov["data_end"] is None:
            raise HTTPException(503, f"no data loaded for region '{self.region}'. Run: python tasks.py etl")
        self.data_start, self.data_end = cov["data_start"], cov["data_end"]
        self.start = start or self.data_start
        self.end = end or self.data_end
        if self.start > self.end:
            raise HTTPException(422, "start must be <= end")
        self.cells = q.area_cells(b, tuple(p) if p else None)
        self.custom = self.cells is not None


class Edu:
    """Educational options shared by the data endpoints."""
    def __init__(self,
                 learn: bool = Query(True, description="include the `learn` block (template text, no AI)"),
                 nivel: edu.Nivel = Query("estudante", description="simples | estudante | tecnico"),
                 lang: edu.Lang = Query("pt", description="pt | en")):
        self.learn, self.nivel, self.lang = learn, nivel, lang


def _nan(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def _cal_cell(r) -> CalendarCell:
    return CalendarCell(year=int(r.year), month=int(r.month), value=round(float(r.harmonized_total), 2),
                        modis_cell_days=int(r.modis_cell_days), viirs_cell_days=int(r.viirs_cell_days),
                        hotspot_count=int(r.hotspot_count), obs_days=int(r.obs_days), is_partial=bool(r.is_partial),
                        daily_mean=round(float(r.daily_mean), 3), percentile=_nan(round(float(r.percentile), 1)) if pd.notna(r.percentile) else None,
                        anomaly_zscore=round(float(r.anomaly_zscore), 2) if pd.notna(r.anomaly_zscore) else None,
                        is_top=bool(getattr(r, "is_top", False)),
                        deviation_pct=_nan(getattr(r, "deviation_pct", None)))


def add_deviation(m: pd.DataFrame, min_ref: int = 3) -> pd.DataFrame:
    """% deviation of daily_mean vs the mean daily_mean of the same month in previous complete years."""
    m = m.copy()
    dev = []
    for r in m.itertuples():
        ref = m[(m.month == r.month) & (m.year < r.year) & ~m.is_partial]
        mu = ref.daily_mean.mean() if len(ref) >= min_ref else np.nan
        dev.append(round(float((r.daily_mean - mu) / mu * 100), 1) if pd.notna(mu) and mu > 0 else None)
    m["deviation_pct"] = dev
    return m


def category_of(p) -> str:
    if p is None or pd.isna(p):
        return "indisponivel"
    return ("muito_abaixo" if p < 10 else "abaixo" if p < 33 else "normal" if p <= 67
            else "acima" if p <= 90 else "muito_acima")


CAT_TXT = {"pt": {"muito_abaixo": "bem abaixo do normal", "abaixo": "abaixo do normal", "normal": "dentro do normal",
                  "acima": "acima do normal", "muito_acima": "bem acima do normal"},
           "en": {"muito_abaixo": "well below normal", "abaixo": "below normal", "normal": "within normal",
                  "acima": "above normal", "muito_acima": "well above normal"}}


def comparison_for(a, lang: str) -> Comparison | None:
    """Current month vs previous years. Region: same days 1..d from the daily series; custom area: monthly daily_mean."""
    end = a.data_end
    y, mo, d = end.year, end.month, end.day
    dim = pd.Timestamp(end).days_in_month
    prov = end >= edu.PROVISIONAL_FROM
    if a.custom:
        m = q.monthly(a.region, a.cells)
        last = m.iloc[-1]
        ref = m[(m.month == last.month) & (m.year < last.year) & ~m.is_partial]
        cur, refv, days, same = float(last.daily_mean), ref.daily_mean.to_numpy(dtype=float), int(last.obs_days), False
        value = float(last.harmonized_total)
        years = (int(ref.year.min()), int(ref.year.max())) if len(ref) else (None, None)
    else:
        r = q.regional(a.region)
        r = r[(r.date.dt.month == mo) & (r.date.dt.day <= d)]
        g = r.groupby(r.date.dt.year).agg(v=("harmonized", lambda s: s.sum(min_count=1)), n=("harmonized", "count"))
        if y not in g.index or pd.isna(g.loc[y, "v"]):
            return None
        value = cur = float(g.loc[y, "v"])
        ref = g[(g.index < y) & (g.n == d)]
        refv, days, same = ref.v.to_numpy(dtype=float), d, d < dim
        years = (int(ref.index.min()), int(ref.index.max())) if len(ref) else (None, None)
    n = len(refv)
    if n < 3:
        return Comparison(year=y, month=mo, days_compared=days, same_days_only=same, value=round(value, 1),
                          category="indisponivel", n_ref=n, is_provisional=prov,
                          sentence=("Ainda não há anos suficientes para comparar." if lang == "pt"
                                    else "There are not enough years to compare yet."))
    mu = float(np.mean(refv))
    dev = round((cur - mu) / mu * 100, 1) if mu > 0 else None
    pct = round(float(((refv < cur).sum() + 0.5 * (refv == cur).sum()) / n * 100), 1)
    cat = category_of(pct)
    ml = edu.month_label(y, mo, lang)
    if lang == "pt":
        span = f" (dias 1 a {d})" if same else ""
        base = f"à média dos mesmos dias de {n} anos" if same else f"à média do mesmo mês em {n} anos"
        dv = f"{edu.fmt_num(dev, 1, 'pt', sign=True)}% em relação {base} ({years[0]}–{years[1]}), " if dev is not None else ""
        sent = (f"{ml[0].upper() + ml[1:]}{span} está {CAT_TXT['pt'][cat]}: {edu.fmt_int(value, 'pt')} células-dia com "
                f"detecção, {dv}percentil {pct:.0f}." + (" Dados provisórios." if prov else ""))
    else:
        span = f" (days 1 to {d})" if same else ""
        base = f"the average of the same days in {n} years" if same else f"the average of the same month in {n} years"
        dv = f"{edu.fmt_num(dev, 1, 'en', sign=True)}% relative to {base} ({years[0]}–{years[1]}), " if dev is not None else ""
        sent = (f"{ml}{span} is {CAT_TXT['en'][cat]}: {edu.fmt_int(value, 'en')} cell-days with detection, "
                f"{dv}percentile {pct:.0f}." + (" Provisional data." if prov else ""))
    return Comparison(year=y, month=mo, days_compared=days, same_days_only=same, value=round(value, 1),
                      reference_mean=round(mu, 1), deviation_pct=dev, percentile=pct, category=cat, n_ref=n,
                      ref_year_min=years[0], ref_year_max=years[1], is_provisional=prov, sentence=sent)


def br_int(v: float) -> str:
    """12345.6 -> '12.346' (pt-BR thousands separator)."""
    return f"{v:,.0f}".replace(",", ".")


def br_num(v: float, nd: int = 1, sign: bool = False) -> str:
    """-0.83 -> '−0,8' (pt-BR decimal comma, typographic minus)."""
    s = f"{v:+.{nd}f}" if sign else f"{v:.{nd}f}"
    return s.replace(".", ",").replace("-", "−")


def anomaly_sentence(r, area_label: str, lang: str = "pt") -> Anomaly:
    z, p = r.anomaly_zscore, r.percentile
    mes = f"{MESES[int(r.month) - 1]} de {int(r.year)}"
    partial = f" (parcial: {int(r.obs_days)} de {int(r.days_in_month)} dias observados)" if r.is_partial else ""
    if lang == "en":
        ml = edu.month_label(int(r.year), int(r.month), "en")
        part = f" (partial: {int(r.obs_days)} of {int(r.days_in_month)} days observed)" if r.is_partial else ""
        if pd.isna(z):
            cat, txt = "indisponivel", f"There is not enough history yet to compare {ml}{part}."
        else:
            cat = category_of(p)
            txt = (f"{ml}{part} is {CAT_TXT['en'][cat]} for {area_label}: {edu.fmt_int(r.harmonized_total, 'en')} "
                   f"cell-days with detection, percentile {p:.0f} (z = {edu.fmt_num(z, 1, 'en', sign=True)}) "
                   "relative to the same month in other years.")
    elif pd.isna(z):
        cat, txt = "indisponivel", f"Ainda não há histórico suficiente para comparar {mes}{partial}."
    else:
        # Category from the percentile (fire counts are strongly skewed, so z alone misleads).
        cat = ("muito_abaixo" if p < 10 else "abaixo" if p < 33 else "normal" if p <= 67
               else "acima" if p <= 90 else "muito_acima")
        desc = {"muito_abaixo": "bem abaixo do normal", "abaixo": "abaixo do normal",
                "normal": "dentro do normal", "acima": "acima do normal", "muito_acima": "bem acima do normal"}[cat]
        txt = (f"{mes.capitalize()}{partial} está {desc} para {area_label}: "
               f"{br_int(r.harmonized_total)} células-dia com fogo, percentil {p:.0f} "
               f"(z = {br_num(z, 1, sign=True)}) em relação ao mesmo mês nos outros anos.")
    return Anomaly(year=int(r.year), month=int(r.month), value=round(float(r.harmonized_total), 2),
                   percentile=None if pd.isna(p) else round(float(p), 1),
                   anomaly_zscore=None if pd.isna(z) else round(float(z), 2),
                   is_partial=bool(r.is_partial), obs_days=int(r.obs_days), category=cat, sentence=txt)


def risk_summary(region: str, horizon: int = 7, lang: str = "pt") -> RiskSummary:
    f = q.forecast(region, horizon)
    if f.empty:
        return RiskSummary(available=False, horizon_days=horizon,
                           message="Previsão de risco ainda não disponível para esta região." if lang == "pt"
                           else "Risk forecast not yet available for this region.")
    return RiskSummary(available=True, forecast_date=f.forecast_date.iloc[0], horizon_days=horizon,
                       n_cells=len(f), n_high=int((f.risk_class == "alto").sum()),
                       n_very_high=int((f.risk_class == "muito_alto").sum()),
                       mean_probability=round(float(f.probability.mean()), 4),
                       message=(f"Probabilidade estimada de ao menos uma detecção de foco de calor nos próximos {horizon} "
                                "dias, por hexágono. Probabilidade não é certeza." if lang == "pt" else
                                f"Estimated probability of at least one heat detection in the next {horizon} days, "
                                "per hexagon. Probability is not certainty."))


# ------------------------------------------------------------------ endpoints
@app.get("/health", response_model=Health)
def health():
    try:
        with db.engine().connect() as c:
            c.execute(text("SELECT 1"))
        st = "ok"
    except Exception as e:  # report, don't crash
        st = f"error: {type(e).__name__}"
    return Health(status="ok" if st == "ok" else "degraded", database=st, time=datetime.now(timezone.utc))


def _lite_progress(key: str) -> float | None:
    """Years already checkpointed by the lite history pipeline / years expected (2003..today)."""
    from etl.config import path as _path
    d = _path("processed") / "_lite" / key
    if not d.exists():
        return 0.0
    n = len(list(d.glob("*.parquet")))
    return round(min(1.0, n / (date.today().year - 2003 + 1)), 2)


@app.get("/meta", response_model=Meta)
def meta():
    out = []
    for k, r in regions().items():
        try:
            cov = q.coverage(k)
        except Exception:
            cov = {"data_start": None, "data_end": None}
        out.append(Region(key=k, name=r.name, bbox=list(r.bbox), data_start=cov["data_start"], data_end=cov["data_end"],
                          name_en=r.name_en or r.name, group=r.group, live=r.live,
                          progress=_lite_progress(k) if (r.live and not cov['data_start']) else None))
    default = get_region().key
    return Meta(regions=out, default_region=default, h3_resolution=settings()["transform"]["h3_resolution"],
                daily_window_start=q.coverage(default).get("daily_window_start"),
                last_etl_run=q.last_run(default), attribution=ATTRIBUTION)


@app.get("/calendar", response_model=CalendarResponse)
def calendar(a: Area = Depends(), e: Edu = Depends(), top_n: int = Query(5, ge=0, le=24)):
    m = q.monthly(a.region, a.cells)
    if not m.empty:
        m = add_deviation(m)
    if m.empty:
        raise HTTPException(503, "no monthly statistics loaded")
    sel = q.in_period(m, a.start, a.end).copy()
    full = sel[~sel.is_partial]
    top = set(full.nlargest(top_n, "harmonized_total").index) if top_n else set()
    sel["is_top"] = sel.index.isin(top)
    last = m.iloc[-1]
    res = settings()["transform"]["h3_resolution"]
    label = ("a área selecionada" if e.lang == "pt" else "the selected area") if a.custom else get_region(a.region).name
    peak = full.loc[full.harmonized_total.idxmax()] if len(full) else None

    def build():
        cmp = comparison_for(a, e.lang)
        return edu.learn_calendar(nivel=e.nivel, lang=e.lang, region_name=label,
                                  peak=(int(peak.year), int(peak.month), float(peak.harmonized_total)) if peak is not None else None,
                                  current={"sentence": cmp.sentence} if cmp else None, end=a.end)
    return CalendarResponse(region=a.region, area="custom" if a.custom else "region", unit=UNIT.format(res=res),
                            start=a.start, end=a.end, cells=[_cal_cell(r) for r in sel.itertuples()],
                            current=_cal_cell(last), learn=edu.opt_learn(e.learn, build))


@app.get("/summary", response_model=Summary)
def summary(a: Area = Depends(), e: Edu = Depends()):
    m = q.monthly(a.region, a.cells)
    sel = q.in_period(m, a.start, a.end)
    if sel.empty:
        raise HTTPException(404, "no data in the selected period")
    full = sel[~sel.is_partial]
    last = m.iloc[-1]
    same = m[(m.month == last.month) & (m.year != last.year) & ~m.is_partial]
    label = ("a área selecionada" if e.lang == "pt" else "the selected area") if a.custom else get_region(a.region).name
    peak = full.loc[full.harmonized_total.idxmax()] if len(full) else None
    return Summary(region=a.region, start=a.start, end=a.end, total_hotspots=int(sel.hotspot_count.sum()),
                   total_harmonized=round(float(sel.harmonized_total.sum()), 1),
                   monthly_mean=round(float(full.harmonized_total.mean()), 1) if len(full) else 0.0,
                   same_month_mean=round(float(same.harmonized_total.mean()), 1) if len(same) else None,
                   current=anomaly_sentence(last, label, e.lang),
                   peak=_cal_cell(peak) if peak is not None else None,
                   comparison=comparison_for(a, e.lang),
                   risk_next_7_days=risk_summary(a.region, lang=e.lang))


@app.get("/hexgrid", response_model=HexGridResponse)
def hexgrid(a: Area = Depends(), e: Edu = Depends(), boundary: bool = True,
            limit: int = Query(40000, ge=1, le=100000),
            start: Optional[date] = Query(None, description="default: last 30 days of data")):
    if a.lite:
        raise HTTPException(409, "this region has regional history only: use GET /live for the map")
    s = start or (a.data_end - timedelta(days=29))
    df, gran = q.hexgrid(a.region, s, a.end, a.cells, boundary)
    n_cells = len(df)
    top_value = float(df.value.max()) if n_cells else None
    df = df.head(limit)
    cells = [HexCell(cell_id=r.cell_id, lat=r.lat, lon=r.lon, value=float(r.value), fire_days=int(r.fire_days),
                     modis_count=int(r.modis_count), viirs_count=int(r.viirs_count),
                     frp_sum=None if pd.isna(r.frp_sum) else round(float(r.frp_sum), 1),
                     boundary=r.boundary if boundary else None) for r in df.itertuples()]
    return HexGridResponse(region=a.region, start=s, end=a.end, granularity=gran,
                           resolution=settings()["transform"]["h3_resolution"],
                           max_value=float(df.value.max()) if len(df) else 0.0, n_cells=n_cells, cells=cells,
                           learn=edu.opt_learn(e.learn, lambda: edu.learn_map(
                               nivel=e.nivel, lang=e.lang, region_name=get_region(a.region).name, start=s, end=a.end,
                               n_cells=n_cells, top_value=top_value, granularity=gran, custom=a.custom)))


@app.get("/comparison", response_model=ComparisonResponse)
def comparison(a: Area = Depends()):
    r = q.regional(a.region)
    r = r[(r.date >= pd.Timestamp(a.start)) & (r.date <= pd.Timestamp(a.end))]
    r = r.assign(year=r.date.dt.year, month=r.date.dt.month,
                 m=r.modis_fcd.where(r.modis_obs), v=r.viirs_fcd.where(r.viirs_obs))
    g = r.groupby(["year", "month"]).agg(m=("m", lambda s: s.sum(min_count=1)), v=("v", lambda s: s.sum(min_count=1)),
                                          h=("harmonized", lambda s: s.sum(min_count=1)),
                                          mh=("modis_hotspots", "sum"), vh=("viirs_hotspots", "sum")).reset_index()
    pts = [ComparisonPoint(year=int(x.year), month=int(x.month),
                           modis_cell_days=None if pd.isna(x.m) else int(x.m),
                           viirs_cell_days=None if pd.isna(x.v) else int(x.v),
                           harmonized=None if pd.isna(x.h) else round(float(x.h), 1),
                           modis_hotspots=int(x.mh), viirs_hotspots=int(x.vh)) for x in g.itertuples()]
    return ComparisonResponse(region=a.region, series=pts)


@app.get("/harmonization", response_model=HarmonizationResponse)
def harmonization(a: Area = Depends(), e: Edu = Depends()):
    r = q.regional(a.region)
    ov = r[r.modis_obs & r.viirs_obs]
    sel = r[(r.date >= pd.Timestamp(a.start)) & (r.date <= pd.Timestamp(a.end))]
    sel = sel.assign(year=sel.date.dt.year, month=sel.date.dt.month,
                     mr=sel.modis_fcd.where(sel.modis_obs), vr=sel.viirs_fcd.where(sel.viirs_obs),
                     both=sel.modis_obs & sel.viirs_obs)
    s1 = lambda s: s.sum(min_count=1)  # noqa: E731
    g = sel.groupby(["year", "month"]).agg(mr=("mr", s1), vr=("vr", s1), mc=("modis_calibrated", s1),
                                            h=("harmonized", s1), ov=("both", "any")).reset_index()
    rnd = lambda v: None if pd.isna(v) else round(float(v), 1)  # noqa: E731
    series = [HarmonizationPoint(year=int(x.year), month=int(x.month), modis_raw=rnd(x.mr), viirs_raw=rnd(x.vr),
                                 modis_calibrated=rnd(x.mc), harmonized=rnd(x.h), overlap=bool(x.ov))
              for x in g.itertuples()]
    met = q.calib_metrics(a.region)
    metrics = [CalibrationMetric(method=x.method, scope=x.scope, bias=_nan(x.bias), rmse=_nan(x.rmse),
                                 r2=_nan(x.r2), overlap_days=None if pd.isna(x.overlap_days) else int(x.overlap_days))
               for x in met.itertuples()]
    h = settings()["harmonization"]
    res = settings()["transform"]["h3_resolution"]
    return HarmonizationResponse(
        region=a.region, method=h["method"], unit=UNIT.format(res=res),
        calibration_years=list(h.get("calibration_years") or []),
        viirs_reference=list(h["viirs_reference_priority"]),
        overlap_start=ov.date.min().date() if len(ov) else None,
        overlap_end=ov.date.max().date() if len(ov) else None,
        series=series, metrics=metrics, limitations=LIMITATIONS if e.lang == "pt" else LIMITATIONS_EN,
        limitations_simple=edu.LIMITATIONS_SIMPLE[e.lang],
        learn=edu.opt_learn(e.learn, lambda: edu.learn_harmonization(
            nivel=e.nivel, lang=e.lang, calib=list(h.get("calibration_years") or []),
            r2_daily=next((m.r2 for m in metrics if m.method == h["method"] and m.scope == "loyo_daily"), None),
            r2_monthly=next((m.r2 for m in metrics if m.method == h["method"] and m.scope == "loyo_monthly"), None))))


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
]
LIMITATIONS_EN = [
    "The VIIRS reference uses one satellite per day (Suomi NPP until 2026-07-31, then NOAA-20 NRT); adding "
    "satellites would inflate counts by ~1.5x from 2018 on.",
    "The MODIS-to-VIIRS calibration was fitted on 2012–2023; Terra/Aqua orbital drift from 2022 changes MODIS "
    "sensitivity, so 2024+ is not part of the fit (there the series uses VIIRS directly).",
    "The most recent days come from NRT (near-real-time) products and may change when NASA publishes the standard processing.",
    "Clouds and smoke hide hotspots from both sensors at once; calibration cannot recover fire no satellite saw.",
    "Before 2012 the series is calibrated MODIS: higher uncertainty than in the VIIRS period.",
]


_LIVE_CACHE: dict = {}


def _fires(bbox, days: int):
    """Worldwide detections: the worker's rolling local store when fresh, else NASA FIRMS directly."""
    from alerts import firms_live
    from etl import live_store
    try:
        if live_store.covers(max(days, 2)) and live_store.is_fresh():
            return live_store.fires(days, tuple(bbox))
    except Exception:
        pass
    return firms_live.fetch(tuple(bbox), days=days)
_LIVE_TTL_S = 600  # NRT updates every few hours; 10 min keeps us far below the FIRMS transaction limits


@app.get("/live", response_model=RecentResponse, tags=["live"],
         summary="Near-real-time detections for any region (FIRMS NRT, last 1-5 days, no DB)")
def live(region: str = Query(..., description="region key (config/regions.yaml)"),
         days: int = Query(1, ge=1, le=5), limit: int = Query(20000, ge=1, le=100000)):
    """Global monitoring tier: straight from NASA FIRMS NRT (VIIRS NOAA-20/21 + MODIS), quality filtered.
    Cached 10 min per (region, days). No history: calendar, harmonization and forecast need the loaded series."""
    import time as _t
    import h3
    from alerts import firms_live
    try:
        rg = get_region(region)
    except SystemExit as e:
        raise HTTPException(404, str(e))
    key = (rg.key, days)
    hit = _LIVE_CACHE.get(key)
    if hit and _t.time() - hit[0] < _LIVE_TTL_S:
        fires = hit[1]
    else:
        try:
            fires = _fires(tuple(rg.bbox), days)
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        _LIVE_CACHE[key] = (_t.time(), fires)
    res = settings()["transform"]["h3_resolution"]
    per: dict = {}
    for f in fires:
        d = f.when_utc.date()
        fam = "MODIS" if "MODIS" in f.satellite else "VIIRS"
        row = per.setdefault(d, {"MODIS": set(), "VIIRS": set(), "n": 0})
        row[fam].add(h3.latlng_to_cell(f.lat, f.lon, res)); row["n"] += 1
    day_rows = [RecentDay(date=d, harmonized=None, modis_fcd=len(v["MODIS"]), viirs_fcd=len(v["VIIRS"]), hotspots_total=v["n"])
                for d, v in sorted(per.items())]
    ordered = sorted(fires, key=lambda f: f.frp or 0, reverse=True)
    dets = [Detection(lat=f.lat, lon=f.lon, date=f.when_utc.date(), time_utc=int(f.when_utc.strftime("%H%M")),
                      satellite=f.satellite, sensor_family="MODIS" if "MODIS" in f.satellite else "VIIRS",
                      frp=f.frp, confidence_class=f.confidence, daynight=f.daynight) for f in ordered[:limit]]
    return RecentResponse(region=rg.key, days=day_rows, detections=dets, truncated=len(fires) > limit)



@app.get("/world", response_model=WorldResponse, tags=["live"],
         summary="Worldwide near-real-time detections (FIRMS NRT), cached 10 min")
def world(days: int = Query(1, ge=1, le=3), limit: int = Query(25000, ge=1, le=60000)):
    import time as _t
    from alerts import firms_live
    key = ("world", days)
    hit = _LIVE_CACHE.get(key)
    if hit and _t.time() - hit[0] < _LIVE_TTL_S:
        fires = hit[1]
    else:
        try:
            fires = _fires((-180.0, -90.0, 180.0, 90.0), days)
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        _LIVE_CACHE[key] = (_t.time(), fires)
    ordered = sorted(fires, key=lambda f: f.frp or 0, reverse=True)
    dets = [Detection(lat=f.lat, lon=f.lon, date=f.when_utc.date(), time_utc=int(f.when_utc.strftime("%H%M")),
                      satellite=f.satellite, sensor_family="MODIS" if "MODIS" in f.satellite else "VIIRS",
                      frp=f.frp, confidence_class=f.confidence, daynight=f.daynight) for f in ordered[:limit]]
    counts = []
    for k, r in regions().items():
        if k.startswith("sample"):
            continue
        w, s_, e, n = r.bbox
        c = sum(1 for f in fires if w <= f.lon <= e and s_ <= f.lat <= n)
        counts.append(WorldRegionCount(key=k, name=r.name_en or r.name, count=c))
    counts.sort(key=lambda x: x.count, reverse=True)
    return WorldResponse(days=days, total=len(fires), latest=max((f.when_utc.date() for f in fires), default=None),
                         detections=dets, truncated=len(fires) > limit, top_regions=counts[:8])


@app.get("/recent", response_model=RecentResponse)
def recent(a: Area = Depends(), days: int = Query(7, ge=1, le=60), limit: int = Query(20000, ge=1, le=100000)):
    if a.lite:
        raise HTTPException(409, "this region has regional history only: use GET /live")
    end = a.data_end
    start = end - timedelta(days=days - 1)
    r = q.regional(a.region)
    r = r[r.date >= pd.Timestamp(start)]
    det, trunc = q.recent_detections(a.region, start, end, a.cells, limit)
    return RecentResponse(
        region=a.region,
        days=[RecentDay(date=x.date.date(), harmonized=_nan(x.harmonized), modis_fcd=int(x.modis_fcd),
                        viirs_fcd=int(x.viirs_fcd), hotspots_total=int(x.hotspots_total)) for x in r.itertuples()],
        detections=[Detection(lat=x.lat, lon=x.lon, date=x.date, time_utc=int(x.time_utc), satellite=x.satellite,
                              sensor_family=x.sensor_family, frp=_nan(x.frp), confidence_class=x.confidence_class,
                              daynight=getattr(x, "daynight", None))
                    for x in det.itertuples()],
        truncated=trunc)


def climatology_fallback(a, lang: str) -> ClimatologyFallback | None:
    mo, y = a.data_end.month, a.data_end.year
    y0, y1 = 2012, y - 1
    df = q.climatology_freq(a.region, mo, y0, y1)
    if df.empty:
        return None
    if a.cells is not None:
        df = df[df.h3_cell.isin(a.cells)]
    th = [0.25, 0.5, 0.75]
    cls = np.select([df.frequency < th[0], df.frequency < th[1], df.frequency < th[2]],
                    ["baixo", "moderado", "alto"], "muito_alto")
    ml = edu.MESES[lang][mo - 1]
    label = (f"Fração dos anos {y0}–{y1} com detecção VIIRS em {ml}" if lang == "pt"
             else f"Fraction of years {y0}–{y1} with a VIIRS detection in {ml}")
    return ClimatologyFallback(label=label, month=mo, ref_year_min=y0, ref_year_max=y1, thresholds=th,
                               cells=[FallbackCell(cell_id=c, frequency=round(float(v), 3), risk_class=str(k))
                                      for c, v, k in zip(df.h3_cell, df.frequency, cls)])


def forecast_learn(e, f: pd.DataFrame, a):
    met = (q.ml_metrics(a.region) or {}).get("metrics", {})
    return edu.opt_learn(e.learn, lambda: edu.learn_forecast(
        nivel=e.nivel, lang=e.lang, available=not f.empty,
        n_high=int((f.risk_class == "alto").sum()) if len(f) else 0,
        n_very_high=int((f.risk_class == "muito_alto").sum()) if len(f) else 0,
        pr_auc=(met.get("model") or {}).get("pr_auc"), clim_pr_auc=(met.get("climatology") or {}).get("pr_auc"),
        forecast_date=f.forecast_date.iloc[0] if len(f) else None))


@app.get("/forecast/live", response_model=ForecastResponse, tags=["live"],
         summary="Persistence-based risk for ANY region from the last 5 days of detections (baseline, not the trained model)")
def forecast_live(region: str = Query(...), limit: int = Query(6000, ge=1, le=20000), boundary: bool = True):
    import time as _t
    import h3
    from alerts import firms_live
    try:
        rg = get_region(region)
    except SystemExit as e:
        raise HTTPException(404, str(e))
    key = (rg.key, 5)
    hit = _LIVE_CACHE.get(key)
    if hit and _t.time() - hit[0] < _LIVE_TTL_S:
        fires = hit[1]
    else:
        try:
            fires = _fires(tuple(rg.bbox), 5)
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        _LIVE_CACHE[key] = (_t.time(), fires)
    res = settings()["transform"]["h3_resolution"]
    days_by_cell: dict[str, set] = {}
    for f in fires:
        days_by_cell.setdefault(h3.latlng_to_cell(f.lat, f.lon, res), set()).add(f.when_utc.date())
    score: dict[str, float] = {}
    for c, d in days_by_cell.items():          # a cell is risky if it burned on many of the last 5 days;
        score[c] = max(score.get(c, 0), float(len(d)))
        for nb in h3.grid_disk(c, 1):          # neighbours inherit part of it (fire spreads)
            if nb != c:
                score[nb] = max(score.get(nb, 0), 0.5 * len(d))
    items = sorted(score.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    def cls(v: float) -> str:
        return "muito_alto" if v >= 4 else "alto" if v >= 3 else "moderado" if v >= 1.5 else "baixo"
    geo = q.cell_geo([c for c, _ in items], boundary).set_index("cell_id")
    cells = [ForecastCell(cell_id=c, lat=float(geo.loc[c, "lat"]), lon=float(geo.loc[c, "lon"]),
                          probability=round(min(0.95, 0.1 + 0.17 * v), 4), risk_class=cls(v),
                          boundary=geo.loc[c, "boundary"] if boundary else None) for c, v in items]
    return ForecastResponse(
        region=rg.key, available=bool(cells), forecast_date=date.today(), horizon_days=7, model_version="persistence-live-v1",
        cells=cells, metrics=None,
        disclaimer="Baseline estimate from how many of the last 5 days each hexagon had a satellite heat detection (plus its neighbours). "
                   "It is NOT the trained model and has not been validated for this region. Probability, not certainty.")


@app.get("/forecast", response_model=ForecastResponse)
def forecast(a: Area = Depends(), e: Edu = Depends(), horizon: int = Query(7, ge=1, le=30), boundary: bool = True,
             limit: int = Query(100000, ge=1, le=100000),
             fallback: bool = Query(False, description="include the climatology expectation (always when no model)"),
             min_probability: float = Query(0.0, ge=0, le=1, description="drop cells below this probability (lighter maps)")):
    f = q.forecast(a.region, horizon)
    disc = FORECAST_DISCLAIMER if e.lang == "pt" else FORECAST_DISCLAIMER_EN
    if f.empty:
        return ForecastResponse(region=a.region, available=False, horizon_days=horizon, cells=[],
                                metrics=q.ml_metrics(a.region), disclaimer=disc,
                                fallback=climatology_fallback(a, e.lang), learn=forecast_learn(e, f, a))
    if a.cells is not None:
        f = f[f.h3_cell.isin(a.cells)]
    if min_probability > 0:
        f = f[f.probability >= min_probability]
    f_all = f
    f = f.nlargest(limit, "probability")
    geo = q.cell_geo(f.h3_cell, boundary).rename(columns={"cell_id": "h3_cell"})
    f = f.merge(geo, on="h3_cell")
    return ForecastResponse(
        region=a.region, available=True, forecast_date=f.forecast_date.iloc[0] if len(f) else None,
        horizon_days=horizon, model_version=f.model_version.iloc[0] if len(f) else None,
        cells=[ForecastCell(cell_id=x.h3_cell, lat=x.lat, lon=x.lon, probability=round(float(x.probability), 4),
                            risk_class=x.risk_class, boundary=x.boundary if boundary else None) for x in f.itertuples()],
        metrics=q.ml_metrics(a.region), disclaimer=disc,
        fallback=climatology_fallback(a, e.lang) if fallback else None, learn=forecast_learn(e, f_all, a))


@app.get("/glossary", response_model=list[edu.GlossaryTerm])
def glossary(nivel: edu.Nivel = Query("estudante"), lang: edu.Lang = Query("pt")):
    return edu.glossary(nivel, lang)


@app.get("/export.csv", response_class=StreamingResponse,
         responses={200: {"content": {"text/csv": {}}, "description": "CSV download"}})
def export_csv(a: Area = Depends(), kind: str = Query("history", pattern="^(history|forecast|monthly|calendar)$"),
               horizon: int = Query(7, ge=1, le=30),
               sensor: str = Query("todos", pattern="^(todos|modis|viirs)$"),
               category: str = Query("todas", pattern="^(todas|modis|viirs|coincidentes)$"),
               lang: edu.Lang = Query("pt")):
    if a.lite and kind in ("history", "forecast"):
        raise HTTPException(409, "this region has regional history only: use kind=monthly or kind=calendar")
    if kind == "forecast":
        f = q.forecast(a.region, horizon)
        if a.cells is not None and len(f):
            f = f[f.h3_cell.isin(a.cells)]
        geo = q.cell_geo(f.h3_cell.unique(), False).rename(columns={"cell_id": "h3_cell"}) if len(f) else pd.DataFrame(columns=["h3_cell", "lat", "lon"])
        f = f.merge(geo, on="h3_cell", how="left") if len(f) else f
        hist, _ = q.export_rows(a.region, a.data_end - timedelta(days=29), a.data_end, a.cells)
        last30 = hist.groupby("cell_id")[["harmonized_count", "modis_count", "viirs_count"]].sum()
        out = pd.DataFrame({
            "date": f.forecast_date.astype(str) if len(f) else [], "region": a.region,
            "cell_id": f.h3_cell if len(f) else [], "lat": f.lat if len(f) else [], "lon": f.lon if len(f) else [],
        })
        for c in ("harmonized_count", "modis_count", "viirs_count"):
            out[c] = out.cell_id.map(last30[c]).fillna(0) if len(out) else []
        out["source_mix"], out["percentile"], out["anomaly_zscore"] = "", np.nan, np.nan
        out["risk_probability"] = f.probability.round(4).to_numpy() if len(f) else []
        out["horizon_days"] = horizon
        name = f"risco_{a.region}_{horizon}d.csv"
    elif kind == "monthly":
        # one row per month for the region/area: small, spreadsheet-friendly (classroom use)
        m = q.in_period(q.monthly(a.region, a.cells), a.start, a.end)
        out = pd.DataFrame({"ano": m.year, "mes": m.month, "region": a.region,
                            "modis_celulas_dia": m.modis_cell_days, "viirs_celulas_dia": m.viirs_cell_days,
                            "harmonizado_celulas_dia": m.harmonized_total.round(2), "focos": m.hotspot_count,
                            "dias_observados": m.obs_days, "parcial": m.is_partial,
                            "percentil": m.percentile.round(1), "anomalia_z": m.anomaly_zscore.round(2)})
        name = f"queimadas_{a.region}_mensal_{a.start.year}-{a.end.year}.csv"
    elif kind == "calendar":
        m = q.in_period(add_deviation(q.monthly(a.region, a.cells)), a.start, a.end)
        out = pd.DataFrame({"year": m.year, "month": m.month, "region": a.region,
                            "harmonized_cell_days": m.harmonized_total.round(2), "daily_mean": m.daily_mean.round(3),
                            "modis_cell_days": m.modis_cell_days, "viirs_cell_days": m.viirs_cell_days,
                            "obs_days": m.obs_days, "is_partial": m.is_partial.astype(int),
                            "percentile": m.percentile.round(1), "deviation_pct": m.deviation_pct})
        name = f"calendario_{a.region}_{a.start}_{a.end}.csv"
    else:
        out, gran = q.export_rows(a.region, a.start, a.end, a.cells)
        mc, vc = out.modis_count.fillna(0), out.viirs_count.fillna(0)
        keep = pd.Series(True, index=out.index)
        if category == "modis":
            keep &= (mc > 0) & (vc == 0)
        elif category == "viirs":
            keep &= (vc > 0) & (mc == 0)
        elif category == "coincidentes":
            keep &= (mc > 0) & (vc > 0)
        if sensor == "modis":
            keep &= mc > 0
        elif sensor == "viirs":
            keep &= vc > 0
        out = out[keep].assign(modis_only=((mc[keep] > 0) & (vc[keep] == 0)).astype(int))
        tag = "" if sensor == "todos" and category == "todas" else f"_{sensor}_{category}"
        name = f"queimadas_{a.region}_{a.start}_{a.end}_{'diario' if gran == 'day' else 'mensal'}{tag}.csv"
    buf = io.StringIO()
    buf.write(f"# {ATTRIBUTION if lang == 'pt' else ATTRIBUTION_EN}\n")
    out.to_csv(buf, index=False, float_format="%.4f")
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Row-Count": str(len(out))})


# ------------------------------------------------------------------ Claude insight (hybrid forecast)
_INSIGHTS: dict = {}


def insight_context(region: str, horizon: int, top_n: int = 15, lang: str = "en") -> dict:
    """Everything Claude may cite. Probabilities come only from risk_forecasts (the model)."""
    f = q.forecast(region, horizon)
    top = f.nlargest(top_n, "probability")
    geo = q.cell_geo(top.h3_cell, False).set_index("cell_id")
    m = q.monthly(region)
    last = m.iloc[-1]
    same = m[(m.month == last.month) & (m.year != last.year) & ~m.is_partial]
    reg = q.regional(region)
    r7, r_prev = reg.tail(7).harmonized.sum(), reg.iloc[-14:-7].harmonized.sum()
    met = q.ml_metrics(region) or {}
    rg = get_region(region)
    return {
        "regiao": {"chave": region, "nome": rg.name, "bbox_oeste_sul_leste_norte": list(rg.bbox)},
        "previsao": {
            "data_origem": str(f.forecast_date.iloc[0]), "horizonte_dias": horizon,
            "alvo": f"probabilidade de >=1 dia com fogo na célula (H3 res 6, ~36 km²) nos próximos {horizon} dias",
            "celulas_avaliadas_acima_de_2pct": int(len(f)),
            "por_classe": {k: int(v) for k, v in f.risk_class.value_counts().items()},
            "limiares_classes": "baixo <0,10 ≤ moderado <0,30 ≤ alto <0,60 ≤ muito_alto",
            "probabilidade_media": round(float(f.probability.mean()), 4),
            "celulas_maior_risco": [
                {"lat": float(geo.loc[c, "lat"]), "lon": float(geo.loc[c, "lon"]),
                 "probabilidade": round(float(p), 3), "classe": k}
                for c, p, k in zip(top.h3_cell, top.probability, top.risk_class)],
        },
        "contexto_historico": {
            "mes_atual": anomaly_sentence(last, rg.name, lang).sentence,
            "media_mesmo_mes_outros_anos_celulas_dia": round(float(same.harmonized_total.mean()), 1) if len(same) else None,
            "celulas_dia_com_fogo_ultimos_7_dias": round(float(r7), 1),
            "celulas_dia_com_fogo_7_dias_anteriores": round(float(r_prev), 1),
        },
        "avaliacao_modelo": {k: met.get(k) for k in ("model_version", "metrics", "beats_baselines_pr_auc",
                                                      "test", "notes", "feature_importance_gain")},
    }


@app.get("/forecast/insight", response_model=ForecastInsight)
def forecast_insight(region: Optional[str] = Query(None), horizon: int = Query(7, ge=1, le=30),
                     audience: str = Query("geral", pattern="^(geral|professor)$"),
                     lang: str = Query("en", pattern="^(en|pt)$")):
    """Claude's pt-BR reading of the model forecast (cached per forecast date and audience)."""
    try:
        key = get_region(region).key
    except SystemExit as e:
        raise HTTPException(404, str(e))
    f = q.forecast(key, horizon)
    if f.empty:
        raise HTTPException(503, "Previsão ainda não disponível. Rode: python tasks.py train && python tasks.py forecast")
    ck = (key, horizon, audience, lang, str(f.forecast_date.iloc[0]))
    if ck not in _INSIGHTS:
        try:
            _INSIGHTS[ck] = llm.generate_insight(insight_context(key, horizon, lang=lang), audience, lang)
        except llm.InsightUnavailable as e:
            raise HTTPException(503, str(e))
    ins = _INSIGHTS[ck]
    return ForecastInsight(region=key, forecast_date=f.forecast_date.iloc[0], horizon_days=horizon,
                           audience=audience, model=llm.MODEL, insight=ins.model_dump(),
                           disclaimer=(FORECAST_DISCLAIMER + " Texto gerado por IA (Claude) a partir das "
                                       "probabilidades do modelo; pode conter erros de interpretação.") if lang == "pt" else
                           "Probability is not certainty. Text generated by AI (Claude) from the model's probabilities; "
                           "it may contain interpretation errors.")
