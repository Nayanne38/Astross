"""Normalize FIRMS MODIS / VIIRS CSVs (archive, area API SP and NRT) into one schema.

Common schema:
  date, time_utc (HHMM int), lat, lon, sensor_family (MODIS|VIIRS), satellite (Terra|Aqua|
  SNPP|NOAA20|NOAA21), frp, brightness (MODIS `brightness` / VIIRS `bright_ti4`, K),
  confidence_class (low|nominal|high), daynight (D|N), source_product, fire_type (FIRMS
  `type`, NaN when the product has none, e.g. NRT).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from etl.config import settings

COLUMNS = ["date", "time_utc", "lat", "lon", "sensor_family", "satellite", "frp", "brightness",
           "confidence_class", "daynight", "source_product", "fire_type"]

# Values observed in FIRMS files (archive + area API, 2026-11-14) plus documented aliases.
SATELLITE_MAP = {
    "terra": "Terra", "t": "Terra", "aqua": "Aqua", "a": "Aqua",
    "n": "SNPP", "npp": "SNPP", "snpp": "SNPP", "suomi npp": "SNPP",
    "n20": "NOAA20", "noaa-20": "NOAA20", "noaa20": "NOAA20", "j1": "NOAA20", "1": "NOAA20",
    "n21": "NOAA21", "noaa-21": "NOAA21", "noaa21": "NOAA21", "j2": "NOAA21", "2": "NOAA21",
}
CATS = {
    "sensor_family": ["MODIS", "VIIRS"],
    "satellite": ["Terra", "Aqua", "SNPP", "NOAA20", "NOAA21"],
    "confidence_class": ["low", "nominal", "high"],
    "daynight": ["D", "N"],
    "source_product": ["MODIS_SP", "MODIS_NRT", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP",
                       "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"],
}
VIIRS_CONF = {"l": "low", "low": "low", "n": "nominal", "nominal": "nominal",
              "h": "high", "high": "high"}


def sensor_family(product: str) -> str:
    p = product.upper()
    if p.startswith("MODIS"):
        return "MODIS"
    if p.startswith("VIIRS"):
        return "VIIRS"
    raise ValueError(f"Unknown FIRMS product '{product}'")


def modis_confidence_class(conf: pd.Series) -> pd.Series:
    lo, hi = settings()["transform"]["modis_confidence_bins"]
    c = pd.to_numeric(conf, errors="coerce")
    return pd.Series(np.select([c < lo, c >= hi], ["low", "high"], "nominal"), index=conf.index)


def normalize(df: pd.DataFrame, product: str) -> pd.DataFrame:
    if df is None or df.empty:
        return empty()
    fam = sensor_family(product)
    missing = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence"} - set(df.columns)
    if missing:
        raise ValueError(f"{product}: missing FIRMS columns {sorted(missing)}")
    sat = df["satellite"].astype(str).str.strip().str.lower().map(SATELLITE_MAP)
    if sat.isna().any():
        bad = sorted(df.loc[sat.isna(), "satellite"].astype(str).unique())[:5]
        raise ValueError(f"{product}: unknown satellite labels {bad} — extend SATELLITE_MAP")
    if fam == "MODIS":
        conf = modis_confidence_class(df["confidence"])
        bright = df.get("brightness")
    else:
        conf = df["confidence"].astype(str).str.strip().str.lower().map(VIIRS_CONF)
        if conf.isna().any():
            raise ValueError(f"{product}: unknown VIIRS confidence values "
                             f"{sorted(df.loc[conf.isna(), 'confidence'].astype(str).unique())[:5]}")
        bright = df.get("bright_ti4")
    out = pd.DataFrame({
        "date": pd.to_datetime(df["acq_date"]),
        "time_utc": pd.to_numeric(df["acq_time"], errors="raise").astype("int16"),
        "lat": df["latitude"].astype(float),
        "lon": df["longitude"].astype(float),
        "sensor_family": fam,
        "satellite": sat,
        "frp": pd.to_numeric(df.get("frp"), errors="coerce").astype("float32"),
        "brightness": pd.to_numeric(bright, errors="coerce").astype("float32"),
        "confidence_class": conf,
        "daynight": df.get("daynight", pd.Series(index=df.index, dtype=object)),
        "source_product": product,
        "fire_type": (pd.to_numeric(df["type"], errors="coerce") if "type" in df
                      else pd.Series(np.nan, index=df.index)).astype("float32"),
    })
    for c, cats in CATS.items():
        out[c] = pd.Categorical(out[c], categories=cats)
    return out[COLUMNS]


def empty() -> pd.DataFrame:
    return normalize(pd.DataFrame({"latitude": [0.0], "longitude": [0.0], "acq_date": ["2000-01-01"],
                                   "acq_time": [0], "satellite": ["Terra"], "confidence": [50]}),
                     "MODIS_SP").iloc[0:0]


def normalize_all(raw) -> pd.DataFrame:
    """raw: dict product->DataFrame or iterable of (product, DataFrame) chunks."""
    items = raw.items() if isinstance(raw, dict) else raw
    parts = [normalize(df, p) for p, df in items if df is not None and len(df)]
    if not parts:
        return empty()
    return pd.concat(parts, ignore_index=True)
