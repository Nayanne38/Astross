"""Load processed parquet outputs into the database (idempotent)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from etl.config import settings
from etl.load import db
from etl.transform.aggregate import cell_str

log = logging.getLogger(__name__)


def _cells_for_db(cells: pd.DataFrame, region: str) -> pd.DataFrame:
    c = cells.copy()
    c["region"] = region
    if not pd.api.types.is_object_dtype(c["h3_cell"]) and not pd.api.types.is_string_dtype(c["h3_cell"]):
        c["h3_cell"] = cell_str(c["h3_cell"])
    return c


def monthly_cells(cells: pd.DataFrame) -> pd.DataFrame:
    """daily cell rows -> per cell x month aggregates."""
    c = cells.assign(year=cells.date.dt.year.astype("int16"), month=cells.date.dt.month.astype("int16"))
    return (c.groupby(["region", "year", "month", "h3_cell"], observed=True)
            .agg(modis_cell_days=("modis_fire", "sum"), viirs_cell_days=("viirs_fire", "sum"),
                 modis_count=("modis_count", "sum"), viirs_count=("viirs_count", "sum"),
                 harmonized_total=("harmonized_count", "sum"), frp_sum=("frp_sum", "sum"))
            .reset_index())


def _detections_for_db(det: pd.DataFrame, region: str) -> pd.DataFrame:
    keep = settings()["load"]["raw_hotspots_keep_days"]
    cutoff = det["date"].max() - pd.Timedelta(days=keep - 1)
    d = det[det["date"] >= cutoff].copy()
    d["region"] = region
    d["h3_cell"] = cell_str(d["h3_cell"])
    for c in ("sensor_family", "satellite", "confidence_class", "daynight", "source_product"):
        d[c] = d[c].astype(str).replace("nan", None)
    return d


def load_processed(od, region: str, cells_window: tuple | None = None) -> dict[str, int]:
    """Write all processed outputs of `od` (data/processed/<region>) to the database.

    cells_window: (first_day, last_day) -> only those days of daily_cell_counts/raw_hotspots are
    replaced (incremental). None -> everything is replaced for the region (full load).
    """
    db.create_schema()
    counts: dict[str, int] = {}

    regional = pd.read_parquet(od / "regional_daily.parquet").assign(region=region)
    monthly = pd.read_parquet(od / "monthly_region_stats.parquet").assign(region=region)
    metrics = pd.read_csv(od / "calibration_metrics.csv").assign(
        region=region, computed_at=datetime.now(timezone.utc))
    cells = _cells_for_db(pd.read_parquet(od / "daily_cell_counts.parquet"), region)
    det = pd.read_parquet(od / "detections.parquet")

    if cells_window is None:
        lo, hi = regional["date"].min(), regional["date"].max()
    else:
        lo, hi = (pd.Timestamp(x) for x in cells_window)
        cells = cells[(cells.date >= lo) & (cells.date <= hi)]
        det = det[(det.date >= lo) & (det.date <= hi)]
        regional = regional[(regional.date >= lo) & (regional.date <= hi)]

    log.info("load: regional_daily %d rows", len(regional))
    counts["regional_daily"] = db.replace_where("regional_daily", regional, region=region,
                                                date=(lo.date(), hi.date()))
    counts["monthly_region_stats"] = db.replace_where("monthly_region_stats", monthly, region=region)
    if cells_window is None:
        counts["calibration_metrics"] = db.replace_where("calibration_metrics", metrics, region=region)
    # monthly per-cell history: months touched by this load are fully replaced
    if cells_window is None:
        mc = monthly_cells(cells)
        counts["monthly_cell_counts"] = db.replace_where("monthly_cell_counts", mc, region=region)
    else:
        all_cells = _cells_for_db(pd.read_parquet(od / "daily_cell_counts.parquet"), region)
        m_lo = lo.to_period("M").to_timestamp()
        mc = monthly_cells(all_cells[(all_cells.date >= m_lo) & (all_cells.date <= hi)])
        n = 0
        for (y, mo), g in mc.groupby(["year", "month"]):
            n += db.replace_where("monthly_cell_counts", g, region=region, year=int(y), month=int(mo))
        counts["monthly_cell_counts"] = n

    keep_cells = settings()["load"].get("daily_cells_keep_days")
    if keep_cells:
        cells = cells[cells.date >= hi - pd.Timedelta(days=keep_cells - 1)]
        lo_cells = max(lo, hi - pd.Timedelta(days=keep_cells - 1))
    else:
        lo_cells = lo
    log.info("load: daily_cell_counts %s rows (this can take a few minutes remotely)", f"{len(cells):,}")
    counts["daily_cell_counts"] = db.replace_where("daily_cell_counts", cells, region=region,
                                                   date=(lo_cells.date(), hi.date()))
    raw = _detections_for_db(det, region)
    counts["raw_hotspots"] = db.replace_where("raw_hotspots", raw, region=region,
                                              date=(raw.date.min().date(), hi.date())) if len(raw) else 0
    # retention: drop raw detections older than the window
    keep = settings()["load"]["raw_hotspots_keep_days"]
    cutoff = (hi - pd.Timedelta(days=keep - 1)).date()
    from sqlalchemy import delete
    from etl.load.schema import raw_hotspots
    from etl.load.schema import daily_cell_counts as dcc
    with db.engine().begin() as conn:
        n_old = conn.execute(delete(raw_hotspots).where(raw_hotspots.c.region == region,
                                                        raw_hotspots.c.date < cutoff)).rowcount
        if keep_cells:
            conn.execute(delete(dcc).where(dcc.c.region == region,
                                           dcc.c.date < (hi - pd.Timedelta(days=keep_cells - 1)).date()))
    log.info("load done: %s (retention removed %s old raw rows)", counts, n_old)
    return counts


def log_run(run_id: str, region: str, mode: str, status: str, started: datetime,
            row_counts: dict | None = None, message: str | None = None) -> None:
    try:
        db.create_schema()
        db.upsert("etl_runs", pd.DataFrame([{
            "run_id": run_id, "region": region, "mode": mode, "status": status,
            "started_at": started, "finished_at": None if status == "running" else datetime.now(timezone.utc),
            "row_counts": _jsonable(row_counts), "message": (message or "")[:4000]}]))
    except Exception as e:  # never hide the original failure because logging failed
        log.error("could not write etl_runs: %s", e)


def _jsonable(o):
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    return o
