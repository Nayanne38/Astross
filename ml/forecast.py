"""Score every cell at the latest observed day and write `risk_forecasts`.

Usage: python -m ml.forecast [--region matopiba]   (run `python -m ml.train` first)
"""
from __future__ import annotations

import argparse
import logging
import pickle

import lightgbm as lgb
import numpy as np
import pandas as pd

from pathlib import Path

from etl.config import get_region, path, settings
from etl.load import db
from ml.features import FEATURES, LONG_LOOKBACK, build_panel, latest_features, load_frames
from ml.train import MODEL_VERSION, out_dir

log = logging.getLogger("ml.forecast")
# Fixed thresholds on P(>=1 fire in the horizon). Fixed (not quantiles) so classes mean the same
# thing every day: a calm week has few "alto" cells, a bad week many.
CLASSES = [(0.10, "baixo"), (0.30, "moderado"), (0.60, "alto"), (1.01, "muito_alto")]
MIN_STORED = 0.02     # cells below this are not stored (keeps the table and the map light)


def risk_class(p: np.ndarray) -> np.ndarray:
    bins = [0.0] + [b for b, _ in CLASSES]
    return pd.cut(p, bins=bins, labels=[n for _, n in CLASSES], right=False, include_lowest=True).astype(str)


def forecast_region(region: str, horizon: int = 7) -> pd.DataFrame:
    f = out_dir(region) / f"risk_model_{horizon}d.txt"
    if not f.exists():
        raise SystemExit(f"model not found: {f}. Run: python tasks.py train")
    model = lgb.Booster(model_file=str(f))
    # Needs LONG_LOOKBACK (372 d) of daily history for the "last year" features. The database keeps 365 d,
    # so prefer the local parquet archive when present (same data, longer), else fall back to the DB window.
    src = "parquet" if (Path(path("processed")) / region / "daily_cell_counts.parquet").exists() else "db"
    start = (pd.Timestamp.today().normalize() - pd.Timedelta(days=LONG_LOOKBACK + 45)).date().isoformat()
    panel = build_panel(load_frames(region, src, start if src == "parquet" else None))
    log.info("features from %s; latest day %s", src, panel.days[-1].date())
    feats = latest_features(panel)
    p = model.predict(feats[FEATURES])
    cal = out_dir(region) / f"risk_calibrator_{horizon}d.pkl"
    if cal.exists():                       # isotonic calibration fitted on the validation block
        with open(cal, "rb") as fh:
            p = pickle.load(fh).predict(p)
    out = pd.DataFrame({"region": region, "h3_cell": feats.h3_cell, "forecast_date": panel.days[-1].date(),
                        "horizon_days": horizon, "probability": np.round(p, 5)})
    out = out[out.probability >= MIN_STORED].copy()
    out["risk_class"] = risk_class(out.probability.to_numpy())
    out["model_version"] = MODEL_VERSION
    db.create_schema()
    n = db.replace_where("risk_forecasts", out, region=region, horizon_days=horizon,
                         forecast_date=panel.days[-1].date())
    log.info("risk_forecasts: %d rows for %s (origin %s)", n, region, panel.days[-1].date())
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    region = get_region(args.region).key
    for h in settings()["ml"]["horizons_days"]:
        out = forecast_region(region, h)
        print(out.risk_class.value_counts().to_string())


if __name__ == "__main__":
    main()
