"""Quality filters and deduplication for normalized detections."""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from etl.config import settings

log = logging.getLogger(__name__)
CONF_RANK = {"low": 0, "nominal": 1, "high": 2}
STATIC_GRID_DEG = 0.01       # ~1 km cells for the static-source mask
STATIC_MIN_FLAGS = 3         # a location flagged type!=0 at least this often is masked


def _grid_key(lat, lon) -> np.ndarray:
    i = np.floor(np.asarray(lat) / STATIC_GRID_DEG).astype(np.int64)
    j = np.floor(np.asarray(lon) / STATIC_GRID_DEG).astype(np.int64)
    return i * 100_000 + j


def static_mask(df: pd.DataFrame) -> np.ndarray:
    """Locations (0.01° grid) repeatedly flagged as static (FIRMS type 1/2/3) in SP data.

    NRT products have no `type` column, so this mask carries the SP knowledge over to NRT.
    """
    drop = settings()["transform"]["drop_static_types"]
    flagged = df[df["fire_type"].isin(drop)]
    if flagged.empty:
        return np.array([], dtype=np.int64)
    counts = pd.Series(_grid_key(flagged.lat, flagged.lon)).value_counts()
    return counts[counts >= STATIC_MIN_FLAGS].index.to_numpy(np.int64)


def apply_filters(df: pd.DataFrame, static: np.ndarray | None = None) -> tuple[pd.DataFrame, dict]:
    cfg = settings()["transform"]
    report = {"input": len(df)}
    df = df.dropna(subset=["lat", "lon", "date"])
    df = df.drop_duplicates(subset=["date", "time_utc", "lat", "lon", "satellite"])
    report["after_exact_dedup"] = len(df)

    min_rank = CONF_RANK[cfg["min_confidence_class"]]
    df = df[df["confidence_class"].isin([c for c, r in CONF_RANK.items() if r >= min_rank])]
    report["after_confidence"] = len(df)

    df = df[~df["fire_type"].isin(cfg["drop_static_types"])]
    static = static if static is not None else np.array([], dtype=np.int64)
    if len(static):
        df = df[~np.isin(_grid_key(df.lat, df.lon), static)]
    report["after_static"] = len(df)
    report["static_mask_cells"] = len(static)
    log.info("quality: %s", report)
    return df.reset_index(drop=True), report


def hotspot_ids(df: pd.DataFrame) -> pd.Series:
    """Deterministic 64-bit id from the identifying source fields (vectorised hash)."""
    key = pd.DataFrame({"p": df.source_product.astype(str), "s": df.satellite.astype(str),
                        "d": df.date.astype("int64"), "t": df.time_utc.astype("int64"),
                        "la": (df.lat * 1e5).round().astype("int64"),
                        "lo": (df.lon * 1e5).round().astype("int64")})
    return pd.util.hash_pandas_object(key, index=False).astype("int64")
