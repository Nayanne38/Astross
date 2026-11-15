"""Live NASA FIRMS active fires (NRT) for any area — used by the alert engine.

Area API: /api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}
One request per source per scan covers every recipient (union bounding box), well within the
FIRMS transaction limits. Low-confidence detections are dropped (same rule as the ETL).
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd

from etl.config import map_key

log = logging.getLogger("alerts.firms")
BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"]
SAT_NAME = {"N20": "NOAA-20 (VIIRS)", "N21": "NOAA-21 (VIIRS)", "N": "Suomi NPP (VIIRS)",
            "Terra": "Terra (MODIS)", "Aqua": "Aqua (MODIS)", "T": "Terra (MODIS)", "A": "Aqua (MODIS)"}
BRT = timezone(timedelta(hours=-3))


@dataclass(frozen=True)
class Fire:
    lat: float
    lon: float
    when_utc: datetime
    satellite: str
    frp: float | None
    confidence: str
    daynight: str | None = None

    @property
    def key(self) -> str:
        return f"{self.lat:.3f}_{self.lon:.3f}_{self.when_utc:%Y%m%d%H%M}"

    @property
    def when_local(self) -> str:
        return self.when_utc.strftime("%Y-%m-%d %H:%M UTC")


def _parse(df: pd.DataFrame, source: str) -> list[Fire]:
    if df.empty:
        return []
    conf = df["confidence"].astype(str).str.lower()
    if source.startswith("MODIS"):
        keep = pd.to_numeric(conf, errors="coerce").fillna(0) >= 30
        cls = pd.to_numeric(conf, errors="coerce").map(lambda v: "alta" if v >= 80 else "nominal")
    else:
        keep = conf.isin(["n", "h", "nominal", "high"])
        cls = conf.map(lambda v: "alta" if v in ("h", "high") else "nominal")
    df, cls = df[keep], cls[keep]
    out = []
    for r, c in zip(df.itertuples(), cls):
        t = str(r.acq_time).zfill(4)
        when = datetime.strptime(f"{r.acq_date} {t}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
        out.append(Fire(float(r.latitude), float(r.longitude), when, SAT_NAME.get(str(r.satellite), str(r.satellite)),
                        float(r.frp) if pd.notna(getattr(r, "frp", None)) else None, c,
                        str(getattr(r, "daynight", "") or "") or None))
    return out


def fetch(bbox: tuple[float, float, float, float], days: int = 1, client: httpx.Client | None = None) -> list[Fire]:
    """Quality-filtered NRT detections in bbox (w, s, e, n) over the last `days` (1-5)."""
    key = map_key()
    if not key:
        raise RuntimeError("FIRMS_MAP_KEY is not configured (.env)")
    w, s, e, n = (round(v, 4) for v in bbox)
    own = client is None
    client = client or httpx.Client(timeout=60)
    fires: list[Fire] = []
    try:
        for src in SOURCES:
            url = f"{BASE}/{key}/{src}/{w},{s},{e},{n}/{days}"
            try:
                r = client.get(url)
                r.raise_for_status()
            except httpx.HTTPError as ex:      # one failing source must not stop the scan
                log.warning("FIRMS %s failed: %s", src, type(ex).__name__)
                continue
            text = r.text.strip()
            if not text or text.lower().startswith(("invalid", "error")):
                log.warning("FIRMS %s: %s", src, text[:80])
                continue
            fires += _parse(pd.read_csv(io.StringIO(text)), src)
    finally:
        if own:
            client.close()
    return fires
