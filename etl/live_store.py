"""Rolling local store of worldwide near-real-time detections: one parquet file per UTC day.

The worker (etl/worker.py) refreshes it and deletes days older than the retention window (30 days).
The API reads it for /world, /live and /forecast/live, so map requests do not hit NASA FIRMS each time.
Disk use is small (~2 MB per day compressed), nothing goes to the database.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from alerts.firms_live import Fire
from etl.config import path

log = logging.getLogger("live_store")
RETENTION_DAYS = 30
COLS = ["lat", "lon", "when_utc", "date", "satellite", "frp", "confidence", "daynight", "family"]


def _dir():
    d = path("processed") / "live_store"
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return d


def _file(d: date):
    return _dir() / f"{d:%Y-%m-%d}.parquet"


def days_present() -> list[date]:
    out = []
    for f in _dir().glob("*.parquet"):
        try:
            out.append(date.fromisoformat(f.stem))
        except ValueError:
            pass
    return sorted(out)


def _to_df(fires: list[Fire]) -> pd.DataFrame:
    if not fires:
        return pd.DataFrame(columns=COLS)
    return pd.DataFrame({
        "lat": np.array([f.lat for f in fires], dtype="float32"),
        "lon": np.array([f.lon for f in fires], dtype="float32"),
        "when_utc": pd.to_datetime([f.when_utc for f in fires], utc=True),
        "date": [f.when_utc.date().isoformat() for f in fires],
        "satellite": pd.Categorical([f.satellite for f in fires]),
        "frp": np.array([np.nan if f.frp is None else f.frp for f in fires], dtype="float32"),
        "confidence": pd.Categorical([f.confidence for f in fires]),
        "daynight": pd.Categorical([f.daynight or "" for f in fires]),
        "family": pd.Categorical(["MODIS" if "MODIS" in f.satellite else "VIIRS" for f in fires]),
    })


def save(fires: list[Fire]) -> int:
    """Merge detections into their day files (replacing duplicates). Returns rows written."""
    df = _to_df(fires)
    n = 0
    for day, g in df.groupby("date"):
        f = _file(date.fromisoformat(day))
        if f.exists():
            g = pd.concat([pd.read_parquet(f), g], ignore_index=True)
        g = g.drop_duplicates(subset=["lat", "lon", "when_utc", "satellite"]).reset_index(drop=True)
        g.to_parquet(f, index=False)
        n += len(g)
    return n


def purge(retention_days: int = RETENTION_DAYS) -> int:
    """Delete day files older than the retention window. Returns files removed."""
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=retention_days - 1)
    gone = 0
    for d in days_present():
        if d < cutoff:
            _file(d).unlink(missing_ok=True)
            gone += 1
    if gone:
        log.info("purged %d day file(s) older than %s", gone, cutoff)
    return gone


def covers(days: int) -> bool:
    """True when the store holds today's (or yesterday's) data and the last `days` days are all there."""
    today = datetime.now(timezone.utc).date()
    have = set(days_present())
    if not have or max(have) < today - timedelta(days=1):
        return False
    need = {today - timedelta(days=i) for i in range(1, days)}   # today may be partial / missing early in the UTC day
    return need <= have


def load_df(days: int, bbox: tuple[float, float, float, float] | None = None) -> pd.DataFrame:
    """Detections of the last `days` UTC days (today included), optionally inside bbox (w, s, e, n)."""
    today = datetime.now(timezone.utc).date()
    parts = []
    for d in days_present():
        if d > today - timedelta(days=days):
            parts.append(pd.read_parquet(_file(d)))
    if not parts:
        return pd.DataFrame(columns=COLS)
    df = pd.concat(parts, ignore_index=True)
    if bbox:
        w, s, e, n = bbox
        df = df[(df.lon >= w) & (df.lon <= e) & (df.lat >= s) & (df.lat <= n)]
    return df


def fires(days: int, bbox: tuple[float, float, float, float] | None = None) -> list[Fire]:
    """Detections of the last `days`*24 h from the local store, as Fire objects."""
    df = load_df(days + 1, bbox)
    if df.empty:
        return []
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=24 * days)
    df = df[df.when_utc >= cutoff]
    return [Fire(float(r.lat), float(r.lon), r.when_utc.to_pydatetime(), str(r.satellite),
                 None if pd.isna(r.frp) else float(r.frp), str(r.confidence), str(r.daynight) or None)
            for r in df.itertuples()]


def is_fresh(max_age_hours: float = 8.0) -> bool:
    """The newest day file was written recently (the worker refreshes every 3 h)."""
    fs = list(_dir().glob("*.parquet"))
    if not fs:
        return False
    import time
    return time.time() - max(f.stat().st_mtime for f in fs) < max_age_hours * 3600
