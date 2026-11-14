"""Standalone ETL entry point (also called by Apache Hop).

  python -m etl.pipelines.run --mode sample            # offline, synthetic sample region
  python -m etl.pipelines.run --mode full --region matopiba
  python -m etl.pipelines.run --steps extract          # only one step

Steps: extract -> transform (normalize, filter, H3, dedup, harmonize, monthly stats, plot).
Outputs: data/processed/<region>/*.parquet + calibration_metrics.csv, docs/img/*.png
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

import pandas as pd

from etl.config import get_region, path, settings
from etl.extract.run import iter_extract
from etl.transform import aggregate, harmonize, normalize, quality, report

log = logging.getLogger("etl")


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)


def out_dir(region_key: str) -> Path:
    d = path("processed") / region_key
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_transform(raw, region, synthetic: bool) -> dict:
    """raw: iterable of (product, DataFrame) chunks; each chunk is normalized then dropped."""
    cfg = settings()
    t0 = time.time()
    det = normalize.normalize_all(raw)
    log.info("normalized %s detections (%.0fs)", f"{len(det):,}", time.time() - t0)
    det, qrep = quality.apply_filters(det, quality.static_mask(det))
    det = aggregate.add_h3(det, cfg["transform"]["h3_resolution"])
    log.info("H3 res %d assigned (%.0fs)", cfg["transform"]["h3_resolution"], time.time() - t0)
    daily_hotspots = det.groupby("date").size().rename("hotspots_total")
    vspans = (det[det.sensor_family == "VIIRS"].groupby(["satellite", "source_product"], observed=True)
              .date.agg(["min", "max"]).reset_index())
    ref_days = aggregate.viirs_reference_days(vspans, cfg["harmonization"]["viirs_reference_priority"])
    det = aggregate.mark_viirs_reference(det, ref_days)
    log.info("VIIRS reference satellite days: %s", ref_days.value_counts().to_dict())
    dedup = aggregate.dedup_cross_satellite(det)
    qrep["after_cross_satellite_dedup"] = len(dedup)
    log.info("cross-satellite dedup: %s -> %s", f"{len(det):,}", f"{len(dedup):,}")

    cells = aggregate.daily_cell_counts(dedup, ref_det=det[det.viirs_ref])
    # coverage = union of each product's [first, last] day (gaps between products stay unobserved)
    spans = det.groupby(["sensor_family", "source_product"], observed=True).date.agg(["min", "max"])
    cov = {f: list(map(tuple, g.to_numpy())) for f, g in spans.groupby(level=0)}
    if set(cov) != {"MODIS", "VIIRS"}:
        raise SystemExit(f"Need both MODIS and VIIRS data to harmonize; got {sorted(cov)}")
    start, end = spans["min"].min(), spans["max"].max()
    regional = aggregate.regional_daily(cells, start, end)
    regional["hotspots_total"] = regional["date"].map(daily_hotspots).fillna(0).astype(int)

    regional["viirs_ref_sat"] = regional["date"].map(ref_days)
    hz = harmonize.harmonize(regional, cells, harmonize.coverage_days(cov["MODIS"]),
                             pd.DatetimeIndex(ref_days.index),
                             cfg["harmonization"]["method"],
                             tuple(cfg["harmonization"].get("calibration_years") or ()) or None)
    monthly = harmonize.monthly_stats(hz.regional)

    od = out_dir(region.key)
    det["hotspot_id"] = quality.hotspot_ids(det)
    det.to_parquet(od / "detections.parquet", index=False)
    hz.cells.to_parquet(od / "daily_cell_counts.parquet", index=False)
    hz.regional.to_parquet(od / "regional_daily.parquet", index=False)
    monthly.to_parquet(od / "monthly_region_stats.parquet", index=False)
    hz.metrics.to_csv(od / "calibration_metrics.csv", index=False)
    meta = {"region": region.key, "synthetic": synthetic, "quality": qrep,
            "coverage": {f"{f}/{p}": [str(a), str(b)] for (f, p), (a, b) in spans.iterrows()},
            "method": cfg["harmonization"]["method"],
            "viirs_reference_days": {k: int(v) for k, v in ref_days.value_counts().items()}, "unplaced_fraction": hz.unplaced_fraction,
            "rows": {"detections": len(det), "daily_cell_counts": len(hz.cells),
                     "monthly": len(monthly)}}
    (od / "run_meta.json").write_text(json.dumps(meta, indent=2, default=str))
    img = report.before_after_plot(hz.regional, hz.metrics, f"{region.name}: MODIS/VIIRS harmonization",
                                   path("reports") / f"harmonization_{region.key}.png", synthetic)
    log.info("transform done in %.0fs -> %s ; plot %s", time.time() - t0, od, img)
    return meta


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=["sample", "full", "incremental"], default="full")
    ap.add_argument("--region", default=None)
    ap.add_argument("--steps", default="extract,transform")
    a = ap.parse_args(argv)
    setup_logging()
    region = get_region(a.region or ("sample_tocantins" if a.mode == "sample" else None))
    steps = a.steps.split(",")
    log.info("ETL start region=%s mode=%s steps=%s", region.key, a.mode, steps)
    raw = iter_extract(region, a.mode)
    if "transform" not in steps:
        for _ in raw:   # extract only: fill the raw cache
            pass
    else:
        meta = run_transform(raw, region, synthetic=a.mode == "sample")
        q = pd.read_csv(out_dir(region.key) / "calibration_metrics.csv")
        print(q[q.scope.isin(["loyo_daily", "loyo_monthly"])].to_string(index=False))
        print(json.dumps(meta["quality"]))


if __name__ == "__main__":
    main()
