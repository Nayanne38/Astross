"""Incremental transform: re-process the last N days of NRT data and merge them into the
processed outputs of the last full run, reusing its calibration models and static mask.

Days in the window are fully replaced (cells that disappear on reprocessing are removed).
Calibration is NOT refitted (that is a full-run decision); monthly stats are recomputed.
"""
from __future__ import annotations

import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from etl.config import settings
from etl.transform import aggregate, harmonize, normalize, quality

log = logging.getLogger(__name__)
REQUIRED = ["detections.parquet", "daily_cell_counts.parquet", "regional_daily.parquet",
            "calibration_models.pkl", "static_mask.npy"]


def run_incremental(raw, od: Path) -> tuple[pd.Timestamp, pd.Timestamp, dict]:
    missing = [f for f in REQUIRED if not (od / f).exists()]
    if missing:
        raise SystemExit(f"Incremental run needs a previous full run in {od} (missing {missing}). "
                         f"Run: python tasks.py etl --mode full")
    cfg = settings()
    det = normalize.normalize_all(raw)
    if det.empty:
        raise SystemExit("Incremental extract returned no detections — check FIRMS availability/key.")
    det, qrep = quality.apply_filters(det, np.load(od / "static_mask.npy"))
    det = aggregate.add_h3(det, cfg["transform"]["h3_resolution"])
    lo, hi = det["date"].min(), det["date"].max()

    vspans = (det[det.sensor_family == "VIIRS"].groupby(["satellite", "source_product"], observed=True)
              .date.agg(["min", "max"]).reset_index())
    ref_days = aggregate.viirs_reference_days(vspans, cfg["harmonization"]["viirs_reference_priority"])
    det = aggregate.mark_viirs_reference(det, ref_days)
    dedup = aggregate.dedup_cross_satellite(det)
    cells = aggregate.daily_cell_counts(dedup, ref_det=det[det.viirs_ref])

    reg = aggregate.regional_daily(cells, lo, hi)
    reg["hotspots_total"] = reg["date"].map(det.groupby("date").size()).fillna(0).astype(int)
    modis_days = harmonize.coverage_days(
        det[det.sensor_family == "MODIS"].groupby("source_product", observed=True).date.agg(["min", "max"])
        .itertuples(index=False, name=None))
    reg["modis_obs"] = reg["date"].isin(modis_days)
    reg["viirs_obs"] = reg["date"].isin(ref_days.index)
    reg["viirs_ref_sat"] = reg["date"].map(ref_days)
    with open(od / "calibration_models.pkl", "rb") as f:
        models = pickle.load(f)
    reg = harmonize.apply_regional(reg, models)
    cells = harmonize.cell_harmonized(cells, reg)

    # merge into previous outputs (replace the window)
    old_reg = pd.read_parquet(od / "regional_daily.parquet")
    regional = pd.concat([old_reg[(old_reg.date < lo) | (old_reg.date > hi)], reg[old_reg.columns.intersection(reg.columns)]],
                         ignore_index=True).sort_values("date").reset_index(drop=True)
    # keep the calendar continuous if the window extends past the previous end
    full_idx = pd.date_range(regional.date.min(), regional.date.max(), freq="D")
    if len(full_idx) != len(regional):
        gap = full_idx.difference(regional.date)
        log.warning("filling %d unobserved days between previous run and window", len(gap))
        filler = pd.DataFrame({"date": gap}).assign(modis_fcd=0, viirs_fcd=0, modis_hotspots=0, viirs_hotspots=0,
                                                    hotspots_total=0, modis_obs=False, viirs_obs=False,
                                                    viirs_ref_sat=None, modis_calibrated=np.nan,
                                                    harmonized=np.nan, harmonized_source="none")
        regional = pd.concat([regional, filler], ignore_index=True).sort_values("date").reset_index(drop=True)
    old_cells = pd.read_parquet(od / "daily_cell_counts.parquet")
    all_cells = pd.concat([old_cells[(old_cells.date < lo) | (old_cells.date > hi)], cells[old_cells.columns]],
                          ignore_index=True)
    old_det = pd.read_parquet(od / "detections.parquet")
    det["hotspot_id"] = quality.hotspot_ids(det)
    all_det = pd.concat([old_det[(old_det.date < lo) | (old_det.date > hi)], det[old_det.columns]],
                        ignore_index=True)
    monthly = harmonize.monthly_stats(regional)

    regional.to_parquet(od / "regional_daily.parquet", index=False)
    all_cells.to_parquet(od / "daily_cell_counts.parquet", index=False)
    all_det.to_parquet(od / "detections.parquet", index=False)
    monthly.to_parquet(od / "monthly_region_stats.parquet", index=False)
    info = {"window": [str(lo.date()), str(hi.date())], "quality": qrep, "new_cells": len(cells),
            "viirs_reference_days": {k: int(v) for k, v in ref_days.value_counts().items()}}
    log.info("incremental merge: %s", info)
    return lo, hi, info
