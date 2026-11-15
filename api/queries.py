"""Data access for the API (SQLAlchemy Core: same code on Supabase/Postgres and SQLite)."""
from __future__ import annotations

import json
import time
from datetime import date
from functools import wraps
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from sqlalchemy import Integer, and_, case, cast, func, select

from etl.config import get_region, path, settings
from etl.load import db
from etl.load.schema import (calibration_metrics, daily_cell_counts, etl_runs, monthly_cell_counts,
                             monthly_region_stats, raw_hotspots, regional_daily, risk_forecasts)
from etl.transform.harmonize import add_anomalies

_CACHE: dict = {}
TTL_S = 600


def cached(fn):
    """Small TTL cache: data changes at most once a day (ETL)."""
    @wraps(fn)
    def wrapper(*args, **kw):
        key = (fn.__name__, args, tuple(sorted(kw.items())))
        hit = _CACHE.get(key)
        if hit and time.time() - hit[0] < TTL_S:
            return hit[1]
        val = fn(*args, **kw)
        _CACHE[key] = (time.time(), val)
        return val
    return wrapper


def clear_cache() -> None:
    _CACHE.clear()


def _df(stmt) -> pd.DataFrame:
    with db.engine().connect() as conn:
        return pd.read_sql(stmt, conn)


# ------------------------------------------------------------------ area filters
def parse_bbox(s: str | None) -> tuple[float, float, float, float] | None:
    if not s:
        return None
    try:
        w, so, e, n = (float(v) for v in s.split(","))
    except ValueError:
        raise ValueError("bbox must be 'west,south,east,north'")
    if not (w < e and so < n):
        raise ValueError("bbox must satisfy west<east and south<north")
    return w, so, e, n


def parse_polygon(s: str | None) -> list[tuple[float, float]] | None:
    """'lon,lat;lon,lat;...' (>=3 vertices) or a GeoJSON Polygon geometry string."""
    if not s:
        return None
    s = s.strip()
    if s.startswith("{"):
        g = json.loads(s)
        if g.get("type") != "Polygon":
            raise ValueError("GeoJSON must be a Polygon")
        pts = [(float(x), float(y)) for x, y, *_ in g["coordinates"][0]]
    else:
        pts = [tuple(float(v) for v in p.split(",")) for p in s.split(";") if p.strip()]
    if len(pts) < 3:
        raise ValueError("polygon needs at least 3 vertices")
    return pts


@cached
def area_cells(bbox: tuple | None, polygon: tuple | None) -> frozenset[str] | None:
    """H3 cells (configured resolution) whose centre lies inside the bbox/polygon."""
    if bbox is None and polygon is None:
        return None
    res = settings()["transform"]["h3_resolution"]
    if polygon is None:
        w, s, e, n = bbox
        polygon = ((w, s), (e, s), (e, n), (w, n))
    shape = h3.LatLngPoly([(lat, lon) for lon, lat in polygon])
    cells = h3.h3shape_to_cells(shape, res)
    if not cells:  # very small area: take the cell containing the centroid
        lon = float(np.mean([p[0] for p in polygon])); lat = float(np.mean([p[1] for p in polygon]))
        cells = [h3.latlng_to_cell(lat, lon, res)]
    return frozenset(cells)


def cell_geo(cell_ids, with_boundary: bool) -> pd.DataFrame:
    rows = []
    for c in cell_ids:
        lat, lon = h3.cell_to_latlng(c)
        r = {"cell_id": c, "lat": round(lat, 5), "lon": round(lon, 5)}
        if with_boundary:
            r["boundary"] = [[round(a, 5), round(b, 5)] for a, b in h3.cell_to_boundary(c)]
        rows.append(r)
    return pd.DataFrame(rows)


# ------------------------------------------------------------------ meta
@cached
def coverage(region: str) -> dict:
    t = regional_daily
    with db.engine().connect() as conn:
        lo, hi = conn.execute(select(func.min(t.c.date), func.max(t.c.date)).where(t.c.region == region)).one()
        dlo = conn.execute(select(func.min(daily_cell_counts.c.date))
                           .where(daily_cell_counts.c.region == region)).scalar()
    return {"data_start": lo, "data_end": hi, "daily_window_start": dlo}


def last_run(region: str) -> dict | None:
    t = etl_runs
    df = _df(select(t).where(t.c.region == region, t.c.status == "success")
             .order_by(t.c.started_at.desc()).limit(1))
    if df.empty:
        return None
    r = df.iloc[0]
    return {"run_id": r.run_id, "mode": r["mode"], "finished_at": str(r.finished_at)}


# ------------------------------------------------------------------ monthly / calendar
@cached
def monthly(region: str, cells: frozenset | None = None) -> pd.DataFrame:
    """Full monthly record for the region, or for a custom set of cells (anomalies recomputed)."""
    t = monthly_region_stats
    reg = _df(select(t).where(t.c.region == region).order_by(t.c.year, t.c.month))
    if cells is None or reg.empty:
        return reg
    m = monthly_cell_counts
    parts = []
    ids = sorted(cells)
    for i in range(0, len(ids), 2000):
        parts.append(_df(select(m.c.year, m.c.month, func.sum(m.c.harmonized_total).label("harmonized_total"),
                                func.sum(m.c.modis_cell_days).label("modis_cell_days"),
                                func.sum(m.c.viirs_cell_days).label("viirs_cell_days"),
                                func.sum(m.c.modis_count + m.c.viirs_count).label("hotspot_count"))
                         .where(m.c.region == region, m.c.h3_cell.in_(ids[i:i + 2000]))
                         .group_by(m.c.year, m.c.month)))
    agg = pd.concat(parts).groupby(["year", "month"], as_index=False).sum() if parts else pd.DataFrame()
    out = reg[["year", "month", "obs_days", "days_in_month", "is_partial"]].merge(agg, on=["year", "month"], how="left")
    for c in ("harmonized_total", "modis_cell_days", "viirs_cell_days", "hotspot_count"):
        out[c] = out[c].fillna(0)
    out["daily_mean"] = out.harmonized_total / out.obs_days
    out["modis_calibrated_total"] = np.nan
    return add_anomalies(out)


def in_period(m: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    key = m.year * 100 + m.month
    return m[(key >= start.year * 100 + start.month) & (key <= end.year * 100 + end.month)]


# ------------------------------------------------------------------ hexgrid
@cached
def hexgrid(region: str, start: date, end: date, cells: frozenset | None, with_boundary: bool) -> tuple[pd.DataFrame, str]:
    cov = coverage(region)
    if cov["daily_window_start"] and start >= cov["daily_window_start"]:
        t = daily_cell_counts
        df = _df(select(t.c.h3_cell, func.sum(t.c.harmonized_count).label("value"),
                        func.count().label("fire_days"),
                        func.sum(t.c.modis_count).label("modis_count"),
                        func.sum(t.c.viirs_count).label("viirs_count"),
                        func.sum(t.c.frp_sum).label("frp_sum"))
                 .where(t.c.region == region, t.c.date >= start, t.c.date <= end)
                 .group_by(t.c.h3_cell))
        gran = "day"
    else:
        t = monthly_cell_counts
        ks, ke = start.year * 100 + start.month, end.year * 100 + end.month
        key = cast(t.c.year, Integer) * 100 + cast(t.c.month, Integer)
        df = _df(select(t.c.h3_cell, func.sum(t.c.harmonized_total).label("value"),
                        # days with fire in the cell-month: best of the two families (upper bound unknown)
                        func.sum(case((t.c.modis_cell_days > t.c.viirs_cell_days, t.c.modis_cell_days),
                                      else_=t.c.viirs_cell_days)).label("fire_days"),
                        func.sum(t.c.modis_count).label("modis_count"),
                        func.sum(t.c.viirs_count).label("viirs_count"),
                        func.sum(t.c.frp_sum).label("frp_sum"))
                 .where(t.c.region == region, and_(key >= ks, key <= ke))
                 .group_by(t.c.h3_cell))
        gran = "month"
    if cells is not None:
        df = df[df.h3_cell.isin(cells)]
    df = df[df.value > 0].rename(columns={"h3_cell": "cell_id"})
    if df.empty:
        return df, gran
    geo = cell_geo(df.cell_id, with_boundary)
    out = df.merge(geo, on="cell_id")
    for c in ("fire_days", "modis_count", "viirs_count"):
        out[c] = out[c].fillna(0).astype(int)
    out["value"] = out.value.round(3)
    return out.sort_values("value", ascending=False).reset_index(drop=True), gran


# ------------------------------------------------------------------ regional daily series
@cached
def regional(region: str) -> pd.DataFrame:
    t = regional_daily
    df = _df(select(t).where(t.c.region == region).order_by(t.c.date))
    df["date"] = pd.to_datetime(df["date"])
    return df


def recent_detections(region: str, start: date, end: date, cells: frozenset | None, limit: int) -> tuple[pd.DataFrame, bool]:
    t = raw_hotspots
    sel = (select(t.c.lat, t.c.lon, t.c.date, t.c.time_utc, t.c.satellite, t.c.sensor_family,
                  t.c.frp, t.c.confidence_class, t.c.daynight, t.c.h3_cell)
           .where(t.c.region == region, t.c.date >= start, t.c.date <= end))
    if cells is not None:  # area filter before the limit, so a drawn area is not cut by detections outside it
        if not cells:
            return _df(sel.limit(0)).drop(columns="h3_cell"), False
        sel = sel.where(t.c.h3_cell.in_(sorted(cells)))
    df = _df(sel.order_by(t.c.date.desc(), t.c.time_utc.desc()).limit(limit + 1))
    return df.head(limit).drop(columns="h3_cell"), len(df) > limit


@cached
def calib_metrics(region: str) -> pd.DataFrame:
    t = calibration_metrics
    return _df(select(t).where(t.c.region == region))


# ------------------------------------------------------------------ forecast
@cached
def forecast(region: str, horizon: int) -> pd.DataFrame:
    t = risk_forecasts
    with db.engine().connect() as conn:
        last = conn.execute(select(func.max(t.c.forecast_date))
                            .where(t.c.region == region, t.c.horizon_days == horizon)).scalar()
    if last is None:
        return pd.DataFrame()
    return _df(select(t).where(t.c.region == region, t.c.horizon_days == horizon, t.c.forecast_date == last))


def ml_metrics(region: str) -> dict | None:
    f = Path(path("processed")) / region / "ml_metrics.json"
    return json.loads(f.read_text()) if f.exists() else None


# ------------------------------------------------------------------ export
def export_rows(region: str, start: date, end: date, cells: frozenset | None) -> tuple[pd.DataFrame, str]:
    cov = coverage(region)
    mon = monthly(region)[["year", "month", "percentile", "anomaly_zscore"]]
    if cov["daily_window_start"] and start >= cov["daily_window_start"]:
        t = daily_cell_counts
        df = _df(select(t.c.date, t.c.h3_cell, t.c.harmonized_count, t.c.modis_count, t.c.viirs_count,
                        t.c.source_mix).where(t.c.region == region, t.c.date >= start, t.c.date <= end)
                 .order_by(t.c.date, t.c.h3_cell))
        df["date"] = pd.to_datetime(df["date"])
        gran = "day"
    else:
        t = monthly_cell_counts
        ks, ke = start.year * 100 + start.month, end.year * 100 + end.month
        key = cast(t.c.year, Integer) * 100 + cast(t.c.month, Integer)
        df = _df(select(t.c.year, t.c.month, t.c.h3_cell, t.c.harmonized_total.label("harmonized_count"),
                        t.c.modis_count, t.c.viirs_count, t.c.modis_cell_days, t.c.viirs_cell_days)
                 .where(t.c.region == region, and_(key >= ks, key <= ke))
                 .order_by(t.c.year, t.c.month, t.c.h3_cell))
        df["date"] = pd.to_datetime(dict(year=df.year, month=df.month, day=1)) if len(df) else pd.Series(dtype="datetime64[ns]")
        df["source_mix"] = np.select([(df.modis_cell_days > 0) & (df.viirs_cell_days > 0), df.viirs_cell_days > 0],
                                     ["BOTH", "VIIRS"], "MODIS") if len(df) else []
        gran = "month"
    if cells is not None:
        df = df[df.h3_cell.isin(cells)]
    # Export labels "who detected" from the raw counts (the stored mix only looks at the reference VIIRS
    # satellite, so a cell seen only by another VIIRS satellite would read "MODIS" with modis_count=0).
    if len(df):
        df["source_mix"] = np.select([(df.modis_count > 0) & (df.viirs_count > 0), df.viirs_count > 0],
                                     ["BOTH", "VIIRS"], "MODIS")
    df["year"], df["month"] = df.date.dt.year, df.date.dt.month
    df = df.merge(mon, on=["year", "month"], how="left")
    geo = cell_geo(df.h3_cell.unique(), False).rename(columns={"cell_id": "h3_cell"})
    df = df.merge(geo, on="h3_cell", how="left")
    df["region"] = region
    df["date"] = df.date.dt.strftime("%Y-%m-%d")
    out = df.rename(columns={"h3_cell": "cell_id"})[
        ["date", "region", "cell_id", "lat", "lon", "harmonized_count", "modis_count", "viirs_count",
         "source_mix", "percentile", "anomaly_zscore"]]
    return out, gran


@cached
def provisional_from(region: str) -> tuple[date | None, bool]:
    """First day of near-real-time (provisional) data and whether that date is exact.
    1) run_meta.json written by the ETL (product coverage, exact); 2) fallback: raw_hotspots, which keeps
    only load.raw_hotspots_keep_days, so NRT may start before its first day (exact=False)."""
    meta = Path(path("processed")) / region / "run_meta.json"
    if meta.exists():
        cov = json.loads(meta.read_text()).get("coverage", {})
        starts = [pd.Timestamp(v[0]).date() for k, v in cov.items() if "NRT" in k and v]
        if starts:
            return min(starts), True
    t = raw_hotspots
    with db.engine().connect() as conn:
        first_nrt = conn.execute(select(func.min(t.c.date))
                                 .where(t.c.region == region, t.c.source_product.like("%NRT%"))).scalar()
        first_raw = conn.execute(select(func.min(t.c.date)).where(t.c.region == region)).scalar()
    if first_nrt is None:
        return None, True
    first_nrt = pd.Timestamp(first_nrt).date()
    exact = first_raw is not None and first_nrt > pd.Timestamp(first_raw).date()
    return first_nrt, exact


@cached
def climatology(region: str, month: int, year_min: int, year_max: int) -> tuple[pd.DataFrame, int]:
    """Per cell: number of years in [year_min, year_max] with >=1 VIIRS reference fire-cell-day in `month`."""
    t = monthly_cell_counts
    df = _df(select(t.c.h3_cell, func.count().label("years"))
             .where(t.c.region == region, t.c.month == month, t.c.year >= year_min, t.c.year <= year_max,
                    t.c.viirs_cell_days > 0)
             .group_by(t.c.h3_cell))
    return df, year_max - year_min + 1
