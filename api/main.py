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

from api import education as edu
from api import queries as q
from api.education import LIMITATIONS, LIMITATIONS_SIMPLES, MESES, br_int, br_num  # noqa: F401 (re-exported)
from api.schemas import (Anomaly, CalendarCell, CalendarResponse, CalibrationMetric, ComparisonPoint,
                         ComparisonResponse, Detection, ForecastCell, ForecastResponse, GlossaryTerm,
                         HarmonizationPoint, HarmonizationResponse, Health, HexCell, HexGridResponse,
                         LearningPath, Meta, Nivel, ProvenanceResponse, RecentDay, RecentResponse, Region,
                         RiskSummary, Summary)
from etl.config import get_region, regions, settings
from etl.load import db

log = logging.getLogger("api")
ATTRIBUTION = ("Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS), "
               "parte do NASA LANCE e do ESDIS. https://earthdata.nasa.gov/firms")
UNIT = ("células-dia com detecção de foco de calor (hexágonos H3 res {res}, ~{km2} km² cada; "
        "escala equivalente ao VIIRS)")
FORECAST_DISCLAIMER = ("Previsão de risco: probabilidade estimada por modelo estatístico, não certeza. "
                       "Consulte as métricas de avaliação e as limitações.")

app = FastAPI(title="Calendário de Queimadas API", version="0.4.0",
              description="Harmonized MODIS/VIIRS active-fire data (NASA FIRMS). " + ATTRIBUTION)
app.add_middleware(CORSMiddleware,
                   allow_origins=[o.strip() for o in os.getenv("API_CORS_ORIGINS", "http://localhost:3000").split(",")],
                   allow_methods=["GET"], allow_headers=["*"],
                   expose_headers=["Content-Disposition"])
app.add_middleware(GZipMiddleware, minimum_size=2000)


# ------------------------------------------------------------------ common params
class Area:
    def __init__(self,
                 region: Optional[str] = Query(None, description="region key (config/regions.yaml)"),
                 start: Optional[date] = Query(None, description="YYYY-MM-DD (default: start of record)"),
                 end: Optional[date] = Query(None, description="YYYY-MM-DD (default: end of record)"),
                 bbox: Optional[str] = Query(None, description="west,south,east,north"),
                 polygon: Optional[str] = Query(None, description="lon,lat;lon,lat;... or GeoJSON Polygon")):
        try:
            self.region = get_region(region).key
        except SystemExit as e:
            raise HTTPException(404, str(e))
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


class LearnOpts:
    """Educational layer options (docs/EDUCACAO_ODS.md §10.2)."""
    def __init__(self,
                 learn: bool = Query(True, description="include the educational `learn` block"),
                 nivel: Nivel = Query("simples", description="language level: simples | estudante | tecnico")):
        self.on = learn
        self.nivel = nivel


def make_ctx(a: Area, nivel: str = "simples") -> edu.Ctx:
    reg = get_region(a.region)
    pf, exact = q.provisional_from(a.region)
    run = q.last_run(a.region)
    return edu.Ctx(nivel=nivel, region=a.region, area_label="a área selecionada" if a.custom else reg.name,
                   custom=a.custom, is_synthetic=reg.synthetic, provisional_from=pf, provisional_exact=exact,
                   last_run=run["finished_at"] if run else None, tz_offset=reg.timezone_offset_hours,
                   res=settings()["transform"]["h3_resolution"], method=settings()["harmonization"]["method"],
                   fonte=ATTRIBUTION)


def unit() -> str:
    res = settings()["transform"]["h3_resolution"]
    return UNIT.format(res=res, km2=edu.area_km2(res))


def _nan(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def _cal_cell(r) -> CalendarCell:
    return CalendarCell(year=int(r.year), month=int(r.month), value=round(float(r.harmonized_total), 2),
                        modis_cell_days=int(r.modis_cell_days), viirs_cell_days=int(r.viirs_cell_days),
                        hotspot_count=int(r.hotspot_count), obs_days=int(r.obs_days), is_partial=bool(r.is_partial),
                        daily_mean=round(float(r.daily_mean), 3), percentile=_nan(round(float(r.percentile), 1)) if pd.notna(r.percentile) else None,
                        anomaly_zscore=round(float(r.anomaly_zscore), 2) if pd.notna(r.anomaly_zscore) else None,
                        is_top=bool(getattr(r, "is_top", False)))


def anomaly_sentence(r, area_label: str, m: Optional[pd.DataFrame] = None,
                     provisional_from: Optional[date] = None) -> Anomaly:
    """Anomaly of one month, texts from api/education.py. `m` = full monthly frame (reference years)."""
    f = edu.month_facts(m if m is not None else pd.DataFrame([r]), r, provisional_from)
    texts = edu.anomaly_texts(f, area_label)
    return Anomaly(year=f.year, month=f.month, value=round(f.value, 2),
                   percentile=None if f.percentile is None else round(f.percentile, 1),
                   anomaly_zscore=None if f.zscore is None else round(f.zscore, 2),
                   is_partial=f.is_partial, obs_days=f.obs_days, category=f.cat, sentence=texts["tecnico"],
                   sentences=texts, daily_mean=round(f.daily_mean, 3), n_ref=f.n_ref, ref_year_min=f.ref_min,
                   ref_year_max=f.ref_max, is_provisional=f.is_provisional)


def risk_summary(region: str, horizon: int = 7) -> RiskSummary:
    f = q.forecast(region, horizon)
    if f.empty:
        return RiskSummary(available=False, horizon_days=horizon,
                           message="Previsão de risco ainda não disponível para esta região.")
    return RiskSummary(available=True, forecast_date=f.forecast_date.iloc[0], horizon_days=horizon,
                       n_cells=len(f), n_high=int((f.risk_class == "alto").sum()),
                       n_very_high=int((f.risk_class == "muito_alto").sum()),
                       mean_probability=round(float(f.probability.mean()), 4),
                       message=f"Probabilidade estimada de ao menos uma detecção de foco de calor nos próximos "
                                   f"{horizon} dias, por hexágono. Probabilidade não é certeza.")


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


@app.get("/meta", response_model=Meta)
def meta():
    out = []
    for k, r in regions().items():
        try:
            cov = q.coverage(k)
        except Exception:
            cov = {"data_start": None, "data_end": None}
        out.append(Region(key=k, name=r.name, bbox=list(r.bbox), data_start=cov["data_start"], data_end=cov["data_end"]))
    default = get_region().key
    return Meta(regions=out, default_region=default, h3_resolution=settings()["transform"]["h3_resolution"],
                daily_window_start=q.coverage(default).get("daily_window_start"),
                last_etl_run=q.last_run(default), attribution=ATTRIBUTION)


@app.get("/calendar", response_model=CalendarResponse)
def calendar(a: Area = Depends(), top_n: int = Query(5, ge=0, le=24), lo: LearnOpts = Depends()):
    m = q.monthly(a.region, a.cells)
    if m.empty:
        raise HTTPException(503, "no monthly statistics loaded")
    sel = q.in_period(m, a.start, a.end).copy()
    full = sel[~sel.is_partial]
    top = set(full.nlargest(top_n, "harmonized_total").index) if top_n else set()
    sel["is_top"] = sel.index.isin(top)
    last = m.iloc[-1]
    learn = None
    if lo.on and len(sel):
        ctx = make_ctx(a, lo.nivel)
        frow = sel.iloc[-1]
        f = edu.month_facts(m, frow, ctx.provisional_from, is_top=bool(frow.is_top))
        peak = (edu.month_facts(m, full.loc[full.harmonized_total.idxmax()], ctx.provisional_from)
                if len(full) else None)
        learn = edu.learn_calendar(f, ctx, a.start, a.end, len(sel), peak, edu.seasonal_share(sel), top_n)
    return CalendarResponse(region=a.region, area="custom" if a.custom else "region", unit=unit(),
                            start=a.start, end=a.end, cells=[_cal_cell(r) for r in sel.itertuples()],
                            current=_cal_cell(last), learn=learn)


@app.get("/summary", response_model=Summary)
def summary(a: Area = Depends(), lo: LearnOpts = Depends()):
    m = q.monthly(a.region, a.cells)
    sel = q.in_period(m, a.start, a.end)
    if sel.empty:
        raise HTTPException(404, "no data in the selected period")
    full = sel[~sel.is_partial]
    last = m.iloc[-1]
    same = m[(m.month == last.month) & (m.year != last.year) & ~m.is_partial]
    label = "a área selecionada" if a.custom else get_region(a.region).name
    pf, _ = q.provisional_from(a.region)
    peak = full.loc[full.harmonized_total.idxmax()] if len(full) else None
    risk = risk_summary(a.region)
    learn = None
    if lo.on:
        ctx = make_ctx(a, lo.nivel)
        learn = edu.learn_summary(edu.month_facts(m, last, pf), ctx, a.start, a.end, risk.available)
    return Summary(region=a.region, start=a.start, end=a.end, total_hotspots=int(sel.hotspot_count.sum()),
                   total_harmonized=round(float(sel.harmonized_total.sum()), 1),
                   monthly_mean=round(float(full.harmonized_total.mean()), 1) if len(full) else 0.0,
                   same_month_mean=round(float(same.harmonized_total.mean()), 1) if len(same) else None,
                   current=anomaly_sentence(last, label, m, pf),
                   peak=_cal_cell(peak) if peak is not None else None,
                   risk_next_7_days=risk, learn=learn)


@app.get("/hexgrid", response_model=HexGridResponse)
def hexgrid(a: Area = Depends(), boundary: bool = True, limit: int = Query(40000, ge=1, le=100000),
            start: Optional[date] = Query(None, description="default: last 30 days of data"),
            lo: LearnOpts = Depends()):
    s = start or (a.data_end - timedelta(days=29))
    df, gran = q.hexgrid(a.region, s, a.end, a.cells, boundary)
    n_cells, total, top10 = edu.hex_facts(df.value) if len(df) else (0, 0.0, None)
    learn = None
    if lo.on:
        centroid = None
        if top10 is not None:
            top = df.head(max(1, int(np.ceil(0.1 * n_cells))))
            if top.lat.std(ddof=0) < 1 and top.lon.std(ddof=0) < 1:     # clustered decile only
                centroid = (float(top.lat.mean()), float(top.lon.mean()))
        learn = edu.learn_hexgrid(make_ctx(a, lo.nivel), s, a.end, gran, n_cells, total, top10, centroid,
                                  int(df.modis_count.sum()) if len(df) else 0,
                                  int(df.viirs_count.sum()) if len(df) else 0,
                                  int(df.fire_days.max()) if len(df) else None)
    df = df.head(limit)
    cells = [HexCell(cell_id=r.cell_id, lat=r.lat, lon=r.lon, value=float(r.value), fire_days=int(r.fire_days),
                     modis_count=int(r.modis_count), viirs_count=int(r.viirs_count),
                     frp_sum=None if pd.isna(r.frp_sum) else round(float(r.frp_sum), 1),
                     boundary=r.boundary if boundary else None) for r in df.itertuples()]
    return HexGridResponse(region=a.region, start=s, end=a.end, granularity=gran,
                           resolution=settings()["transform"]["h3_resolution"],
                           max_value=float(df.value.max()) if len(df) else 0.0, n_cells=n_cells,
                           total_value=round(total, 2), top10_share=None if top10 is None else round(top10, 4),
                           cells=cells, learn=learn)


@app.get("/comparison", response_model=ComparisonResponse)
def comparison(a: Area = Depends(), lo: LearnOpts = Depends()):
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
                           modis_hotspots=int(x.mh), viirs_hotspots=int(x.vh),
                           viirs_modis_ratio=(round(float(x.v / x.m), 3)
                                              if pd.notna(x.v) and pd.notna(x.m) and x.m > 0 else None))
           for x in g.itertuples()]
    learn = None
    if lo.on:
        both = [p for p in pts if p.viirs_cell_days is not None and p.modis_cell_days is not None]
        learn = edu.learn_comparison(
            make_ctx(a, lo.nivel), a.start, a.end,
            edu.ratio([p.viirs_cell_days for p in both], [p.modis_cell_days for p in both]),
            edu.ratio([p.viirs_hotspots for p in both], [p.modis_hotspots for p in both]),
            any(p.viirs_cell_days is None for p in pts), len(pts))
    return ComparisonResponse(region=a.region, series=pts, learn=learn)


@app.get("/harmonization", response_model=HarmonizationResponse)
def harmonization(a: Area = Depends(), lo: LearnOpts = Depends()):
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
    cal_years = list(h.get("calibration_years") or [])
    learn = None
    if lo.on:
        def metric(method, scope="loyo_monthly"):
            x = met[(met.method == method) & (met.scope == scope)]
            return x.iloc[0] if len(x) else None
        mm, raw = metric(h["method"]), metric("raw_modis")
        ov_month = [p.harmonized for p in series if p.overlap and p.harmonized is not None]
        learn = edu.learn_harmonization(
            make_ctx(a, lo.nivel), a.start, a.end,
            has_estimated=any(p.viirs_raw is None and p.modis_calibrated is not None for p in series),
            has_measured=any(p.viirs_raw is not None for p in series), calibration_years=cal_years,
            has_post_window=bool(cal_years) and any(p.year > cal_years[-1] for p in series),
            r2=None if mm is None else _nan(mm.r2), rmse=None if mm is None else _nan(mm.rmse),
            bias=None if mm is None else _nan(mm.bias), rmse_raw=None if raw is None else _nan(raw.rmse),
            monthly_mean=float(np.mean(ov_month)) if ov_month else None)
    return HarmonizationResponse(
        region=a.region, method=h["method"], unit=unit(),
        calibration_years=cal_years,
        viirs_reference=list(h["viirs_reference_priority"]),
        overlap_start=ov.date.min().date() if len(ov) else None,
        overlap_end=ov.date.max().date() if len(ov) else None,
        series=series, metrics=metrics, limitations=LIMITATIONS, limitations_simple=LIMITATIONS_SIMPLES,
        learn=learn)



@app.get("/recent", response_model=RecentResponse)
def recent(a: Area = Depends(), days: int = Query(7, ge=1, le=60), limit: int = Query(20000, ge=1, le=100000),
           lo: LearnOpts = Depends()):
    end = a.data_end
    start = end - timedelta(days=days - 1)
    r = q.regional(a.region)
    r = r[r.date >= pd.Timestamp(start)]
    det, trunc = q.recent_detections(a.region, start, end, a.cells, limit)
    share_high = round(float((det.confidence_class == "high").mean()), 4) if len(det) else None
    learn = None
    if lo.on:
        ctx = make_ctx(a, lo.nivel)
        hours = ((det.time_utc // 100 + ctx.tz_offset) % 24).value_counts() if len(det) else pd.Series(dtype=int)
        learn = edu.learn_recent(ctx, start, end, len(det), int(det.satellite.nunique()) if len(det) else 0,
                                 share_high, sorted(int(h) for h in hours.index[:2]), trunc,
                                 [x.date.date() for x in r.itertuples() if pd.isna(x.harmonized)],
                                 bool(len(det) and det.frp.notna().any()))
    return RecentResponse(
        region=a.region,
        days=[RecentDay(date=x.date.date(), harmonized=_nan(x.harmonized), modis_fcd=int(x.modis_fcd),
                        viirs_fcd=int(x.viirs_fcd), hotspots_total=int(x.hotspots_total)) for x in r.itertuples()],
        detections=[Detection(lat=x.lat, lon=x.lon, date=x.date, time_utc=int(x.time_utc), satellite=x.satellite,
                              sensor_family=x.sensor_family, frp=_nan(x.frp), confidence_class=x.confidence_class)
                    for x in det.itertuples()],
        truncated=trunc, share_high_confidence=share_high, learn=learn)


@app.get("/forecast", response_model=ForecastResponse)
def forecast(a: Area = Depends(), horizon: int = Query(7, ge=1, le=30), boundary: bool = True,
             lo: LearnOpts = Depends()):
    f = q.forecast(a.region, horizon)
    if f.empty:
        learn = edu.learn_forecast(make_ctx(a, lo.nivel), False, horizon, 0, None) if lo.on else None
        return ForecastResponse(region=a.region, available=False, horizon_days=horizon, cells=[],
                                metrics=q.ml_metrics(a.region), disclaimer=FORECAST_DISCLAIMER, learn=learn)
    if a.cells is not None:
        f = f[f.h3_cell.isin(a.cells)]
    geo = q.cell_geo(f.h3_cell, boundary).rename(columns={"cell_id": "h3_cell"})
    f = f.merge(geo, on="h3_cell")
    learn = (edu.learn_forecast(make_ctx(a, lo.nivel), True, horizon, len(f),
                                float(f.probability.mean()) if len(f) else None) if lo.on else None)
    return ForecastResponse(
        region=a.region, available=True, forecast_date=f.forecast_date.iloc[0] if len(f) else None,
        horizon_days=horizon, model_version=f.model_version.iloc[0] if len(f) else None,
        cells=[ForecastCell(cell_id=x.h3_cell, lat=x.lat, lon=x.lon, probability=round(float(x.probability), 4),
                            risk_class=x.risk_class, boundary=x.boundary if boundary else None) for x in f.itertuples()],
        metrics=q.ml_metrics(a.region), disclaimer=FORECAST_DISCLAIMER, learn=learn)


@app.get("/export.csv", response_class=StreamingResponse,
         responses={200: {"content": {"text/csv": {}}, "description": "CSV download"}})
def export_csv(a: Area = Depends(), kind: str = Query("history", pattern="^(history|forecast)$"),
               horizon: int = Query(7, ge=1, le=30)):
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
    else:
        out, gran = q.export_rows(a.region, a.start, a.end, a.cells)
        name = f"queimadas_{a.region}_{a.start}_{a.end}_{'diario' if gran == 'day' else 'mensal'}.csv"
    buf = io.StringIO()
    buf.write(f"# {ATTRIBUTION}\n")
    out.to_csv(buf, index=False, float_format="%.4f")
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ------------------------------------------------------------------ educational endpoints
@app.get("/glossary", response_model=list[GlossaryTerm])
def glossary(nivel: Nivel = Query("simples")):
    """Glossário (pt-BR): definição leiga, técnica e o equívoco comum de cada termo."""
    return edu.glossary(nivel)


@app.get("/glossary/{term_id}", response_model=GlossaryTerm)
def glossary_term(term_id: str, nivel: Nivel = Query("simples")):
    for t in edu.glossary(nivel):
        if t.id == term_id:
            return t
    raise HTTPException(404, f"termo '{term_id}' não está no glossário")


@app.get("/learn/paths", response_model=list[LearningPath])
def learn_paths(region: Optional[str] = Query(None)):
    """Trilhas de aprendizagem com etapas que apontam para visualizações e cartões `learn`."""
    try:
        key = get_region(region).key
    except SystemExit as e:
        raise HTTPException(404, str(e))
    return edu.learning_paths(key)


@app.get("/learn/paths/{path_id}", response_model=LearningPath)
def learn_path(path_id: str, region: Optional[str] = Query(None)):
    for p in learn_paths(region):
        if p.id == path_id:
            return p
    raise HTTPException(404, f"trilha '{path_id}' não existe")


@app.get("/provenance", response_model=ProvenanceResponse)
def provenance(a: Area = Depends(), nivel: Nivel = Query("simples")):
    """De onde vêm os dados, o que é provisório, o que é estimado e as limitações."""
    ctx = make_ctx(a, nivel)
    parts = [f"Dados da NASA FIRMS (satélites MODIS e VIIRS) para {ctx.area_label}, de "
             f"{edu.fmt_date(a.start)} a {edu.fmt_date(a.end)}."]
    parts += [c.texto for c in edu.caveats(ctx, a.start, a.end)]
    if ctx.last_run:
        parts.append(f"Última atualização: {ctx.last_run[:10]}.")
    return ProvenanceResponse(region=a.region, procedencia=edu.provenance(ctx, a.start, a.end),
                              resumo=" ".join(parts), limitacoes=LIMITATIONS, limitacoes_simples=LIMITATIONS_SIMPLES)
