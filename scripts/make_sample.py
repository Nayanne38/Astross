"""Generate the bundled SYNTHETIC sample dataset (data/sample/).

This is NOT real FIRMS data. It mimics the FIRMS CSV column layouts so the whole pipeline
can run offline (tests, demo, no MAP_KEY). The generative process is simple and documented
so tests can check that harmonization recovers a known MODIS/VIIRS sensitivity gap:

* Latent "fire events" per day ~ Poisson(lambda(day-of-year) * year_factor), with a Cerrado-like
  dry-season peak (Aug-Oct). Locations: Gaussian clusters + uniform background.
* Each satellite detects each event independently with a fixed probability
  (MODIS Terra 0.30 / Aqua 0.35; VIIRS 0.85), emitting 1+Poisson(k) jittered hotspots.
* A persistent static heat source (FIRMS type=2) is added to test the static filter.

Deterministic (fixed seed). Run: python scripts/make_sample.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from etl.config import get_region  # noqa: E402

OUT = ROOT / "data" / "sample"
SEED = 20261114
NRT_END = pd.Timestamp("2026-11-13")

# satellite label, sensor, product, start, end, p_detect, extra_points_mean, jitter_deg, utc_day_hhmm
SATS = [
    ("Terra", "MODIS", "MODIS_SP", "2003-01-01", "2025-12-31", 0.30, 0.6, 0.006, 1340),
    ("Aqua", "MODIS", "MODIS_SP", "2003-01-01", "2025-12-31", 0.35, 0.6, 0.006, 1640),
    ("N", "VIIRS", "VIIRS_SNPP_SP", "2012-01-20", "2025-12-31", 0.85, 2.5, 0.002, 1630),
    ("N20", "VIIRS", "VIIRS_NOAA20_SP", "2020-01-01", "2025-12-31", 0.85, 2.5, 0.002, 1540),
    # near-real-time files (last 10 days)
    ("Terra", "MODIS", "MODIS_NRT", "2026-11-04", "2026-11-13", 0.30, 0.6, 0.006, 1340),
    ("Aqua", "MODIS", "MODIS_NRT", "2026-11-04", "2026-11-13", 0.35, 0.6, 0.006, 1640),
    ("N20", "VIIRS", "VIIRS_NOAA20_NRT", "2026-11-04", "2026-11-13", 0.85, 2.5, 0.002, 1540),
    ("N21", "VIIRS", "VIIRS_NOAA21_NRT", "2026-11-04", "2026-11-13", 0.85, 2.5, 0.002, 1450),
]
MODIS_COLS = ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time",
              "satellite", "instrument", "confidence", "version", "bright_t31", "frp", "daynight"]
VIIRS_COLS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time",
              "satellite", "instrument", "confidence", "version", "bright_ti5", "frp", "daynight"]
DRY_YEARS = {2007: 1.7, 2010: 1.8, 2012: 1.4, 2017: 1.5, 2019: 1.4, 2024: 1.9}


def latent_events(rng: np.random.Generator, bbox) -> pd.DataFrame:
    w, s, e, n = bbox
    days = pd.date_range("2003-01-01", NRT_END, freq="D")
    doy = days.day_of_year.to_numpy()
    year_factor = np.array([DRY_YEARS.get(y, 1.0) for y in days.year]) * \
        np.exp(rng.normal(0, 0.15, len(days)))
    lam = (1.2 + 10.0 * np.exp(-((doy - 245) / 35.0) ** 2)) * year_factor
    n_ev = rng.poisson(lam)
    day_idx = np.repeat(np.arange(len(days)), n_ev)
    total = len(day_idx)
    centers = rng.uniform([w + 0.2, s + 0.2], [e - 0.2, n - 0.2], size=(6, 2))
    clustered = rng.random(total) < 0.7
    which = rng.integers(0, len(centers), total)
    lon = np.where(clustered, centers[which, 0] + rng.normal(0, 0.25, total), rng.uniform(w, e, total))
    lat = np.where(clustered, centers[which, 1] + rng.normal(0, 0.25, total), rng.uniform(s, n, total))
    keep = (lon > w) & (lon < e) & (lat > s) & (lat < n)
    return pd.DataFrame({"date": days[day_idx[keep]], "lon": lon[keep], "lat": lat[keep],
                         "intensity": rng.lognormal(0, 0.8, keep.sum())})


def detections(rng, ev: pd.DataFrame, sat) -> pd.DataFrame:
    label, sensor, product, start, end, p, k, jitter, hhmm = sat
    ev = ev[(ev.date >= start) & (ev.date <= end)]
    ev = ev[rng.random(len(ev)) < p]
    reps = 1 + rng.poisson(k, len(ev))
    d = ev.loc[ev.index.repeat(reps)].reset_index(drop=True)
    m = len(d)
    night = rng.random(m) < 0.2
    t = np.where(night, (hhmm + 1200) % 2400, hhmm) + rng.integers(-40, 40, m)
    t = (t // 100 % 24) * 100 + np.clip(t % 100, 0, 59)
    out = pd.DataFrame({
        "latitude": (d.lat + rng.normal(0, jitter, m)).round(5),
        "longitude": (d.lon + rng.normal(0, jitter, m)).round(5),
        "acq_date": d.date.dt.strftime("%Y-%m-%d"),
        "acq_time": t.astype(int),
        "satellite": label,
        "daynight": np.where(night, "N", "D"),
    })
    if sensor == "MODIS":
        out["brightness"] = (310 + 25 * d.intensity + rng.normal(0, 5, m)).clip(300, 500).round(1)
        out["bright_t31"] = (295 + rng.normal(0, 4, m)).round(1)
        out["scan"] = rng.uniform(1.0, 3.5, m).round(1)
        out["track"] = (out.scan * rng.uniform(0.6, 1.0, m)).round(1)
        out["confidence"] = np.clip(rng.beta(4, 2, m) * 100, 0, 100).astype(int)
        out["frp"] = (rng.lognormal(3.0, 1.0, m) * d.intensity).round(1)
        out["instrument"] = "MODIS"
        out["version"] = "6.1NRT" if product.endswith("NRT") else "6.1"
        cols = MODIS_COLS
    else:
        out["bright_ti4"] = (315 + 20 * d.intensity + rng.normal(0, 5, m)).clip(300, 367).round(2)
        out["bright_ti5"] = (290 + rng.normal(0, 4, m)).round(2)
        out["scan"] = rng.uniform(0.32, 0.8, m).round(2)
        out["track"] = rng.uniform(0.36, 0.7, m).round(2)
        out["confidence"] = rng.choice(["l", "n", "h"], m, p=[0.1, 0.75, 0.15])
        out["frp"] = (rng.lognormal(1.8, 1.0, m) * d.intensity).round(2)
        out["instrument"] = "VIIRS"
        out["version"] = "2.0NRT" if product.endswith("NRT") else "2"
        cols = VIIRS_COLS
    out = out[cols]
    if not product.endswith("NRT"):
        out["type"] = 0  # standard-processing files carry FIRMS `type`
    return out


def static_source(rng, sat, lon=-48.3, lat=-10.2) -> pd.DataFrame:
    """Persistent industrial-like heat source, VIIRS SP only, flagged type=2."""
    label, _, product, start, end, *_ = sat
    days = pd.date_range(start, end, freq="D")
    days = days[rng.random(len(days)) < 0.5]
    m = len(days)
    return pd.DataFrame({
        "latitude": (lat + rng.normal(0, 0.001, m)).round(5),
        "longitude": (lon + rng.normal(0, 0.001, m)).round(5),
        "bright_ti4": rng.uniform(330, 360, m).round(2), "scan": 0.4, "track": 0.45,
        "acq_date": days.strftime("%Y-%m-%d"), "acq_time": 430, "satellite": label,
        "instrument": "VIIRS", "confidence": "n", "version": "2",
        "bright_ti5": rng.uniform(290, 300, m).round(2),
        "frp": rng.uniform(5, 15, m).round(2), "daynight": "N", "type": 2,
    })


def main() -> None:
    region = get_region("sample_tocantins")
    rng = np.random.default_rng(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    ev = latent_events(rng, region.bbox)
    print(f"latent events: {len(ev):,}")
    frames: dict[str, list[pd.DataFrame]] = {}
    for sat in SATS:
        frames.setdefault(sat[2], []).append(detections(rng, ev, sat))
    frames["VIIRS_SNPP_SP"].append(static_source(rng, SATS[2]))
    for product, parts in frames.items():
        df = pd.concat(parts, ignore_index=True).sort_values(["acq_date", "acq_time"])
        f = OUT / f"{product}_{region.key}.csv.gz"
        df.to_csv(f, index=False, compression="gzip")
        print(f"{f.relative_to(ROOT)}: {len(df):,} rows")


if __name__ == "__main__":
    main()
