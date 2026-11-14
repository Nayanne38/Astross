"""Data-quality checks. Any failed check raises DataQualityError, which fails the run loudly."""
from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd

from etl.config import settings
from etl.load import db

log = logging.getLogger(__name__)


class DataQualityError(RuntimeError):
    pass


def longest_false_run(mask: np.ndarray) -> int:
    best = cur = 0
    for v in mask:
        cur = 0 if v else cur + 1
        best = max(best, cur)
    return best


def check_processed(od, mode: str, today: date | None = None) -> dict:
    """Checks on the transform outputs (before load)."""
    cfg = settings()["quality_checks"]
    res: dict[str, object] = {}
    fails: list[str] = []

    det = pd.read_parquet(od / "detections.parquet", columns=["date", "lat", "lon", "h3_cell", "frp"])
    regional = pd.read_parquet(od / "regional_daily.parquet")
    metrics = pd.read_csv(od / "calibration_metrics.csv")

    # 1. row counts
    res["rows_detections"] = len(det)
    res["rows_regional_daily"] = len(regional)
    if len(det) == 0:
        fails.append("no detections after filtering")

    # 2. null rates
    for col, max_rate in cfg["max_null_rate"].items():
        rate = float(det[col].isna().mean()) if len(det) else 0.0
        res[f"null_rate_{col}"] = round(rate, 5)
        if rate > max_rate:
            fails.append(f"null rate of {col} = {rate:.2%} > {max_rate:.2%}")

    # 3. date continuity of the regional series and observation gaps in the VIIRS era
    days = pd.to_datetime(regional["date"])
    expected = pd.date_range(days.min(), days.max(), freq="D")
    missing = len(expected.difference(days))
    res["regional_missing_days"] = missing
    if missing:
        fails.append(f"regional_daily is missing {missing} calendar days")
    if regional["date"].duplicated().any():
        fails.append("regional_daily has duplicated dates")
    v = regional[days >= days[regional.viirs_obs].min()] if regional.viirs_obs.any() else regional.iloc[0:0]
    gap = longest_false_run(v.viirs_obs.to_numpy()) if len(v) else 0
    res["max_viirs_observation_gap_days"] = gap
    if gap > cfg["max_observation_gap_days"]:
        msg = f"VIIRS observation gap of {gap} days > {cfg['max_observation_gap_days']}"
        if mode == "sample":   # the synthetic sample has a deliberate SP->NRT gap
            log.warning("DQ[processed] (sample, not failing): %s", msg)
        else:
            fails.append(msg)
    obs = regional.modis_obs | regional.viirs_obs
    if regional.loc[obs, "harmonized"].isna().any():
        fails.append("harmonized value missing on observed days")

    # 4. calibration quality
    row = metrics[(metrics.method == "quantile_mapping") & (metrics.scope == "loyo_monthly")]
    r2 = float(row.r2.iloc[0]) if len(row) else float("nan")
    res["calibration_loyo_monthly_r2"] = round(r2, 4)
    if not r2 >= cfg["min_monthly_r2"]:
        fails.append(f"calibration LOYO monthly R2 {r2:.3f} < {cfg['min_monthly_r2']}")

    # 5. freshness (real data only)
    if mode in ("full", "incremental"):
        lag = ((pd.Timestamp(today or date.today()) - det["date"].max()).days) if len(det) else 999
        res["nrt_lag_days"] = int(lag)
        if lag > cfg["max_nrt_lag_days"]:
            fails.append(f"latest detection is {lag} days old > {cfg['max_nrt_lag_days']}")

    _finish(res, fails, "processed")
    return res


def check_database(region: str, expected: dict[str, int]) -> dict:
    """After load: table row counts in the DB must match what was written."""
    res, fails = {}, []
    counts = db.table_counts(region, ["daily_cell_counts", "regional_daily", "monthly_region_stats",
                                      "calibration_metrics", "raw_hotspots"])
    for t, n in counts.items():
        res[f"db_rows_{t}"] = n
        if n == 0:
            fails.append(f"table {t} is empty for region {region} (run a full load first: python tasks.py etl --mode full)")
    for t in ("regional_daily", "monthly_region_stats"):
        if t in expected and counts.get(t, 0) < expected[t]:
            fails.append(f"{t}: {counts.get(t)} rows in DB < {expected[t]} written")
    _finish(res, fails, "database")
    return res


def _finish(res: dict, fails: list[str], stage: str) -> None:
    res["failed_checks"] = fails
    if fails:
        for f in fails:
            log.error("DQ[%s] FAILED: %s", stage, f)
        raise DataQualityError(f"{len(fails)} data-quality check(s) failed at {stage}: " + "; ".join(fails))
    log.info("DQ[%s] passed: %s", stage, {k: v for k, v in res.items() if k != "failed_checks"})
