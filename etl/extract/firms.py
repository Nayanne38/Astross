"""NASA FIRMS extraction with retries, throttling and a local raw cache.

Sources verified on 2026-11-14 against https://firms.modaps.eosdis.nasa.gov/api/ (see
docs/DATA_DICTIONARY.md):
* Area API: /api/area/csv/{KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE 1-5}/{DATE start, inclusive}
* Data availability: /api/data_availability/csv/{KEY}/ALL
* Yearly country archive (standard processing): /data/country/{dir}/{YYYY}/{dir}_{YYYY}_{Country}.csv
* Limit: 5000 transactions / 10 minutes per MAP_KEY.

The MAP_KEY is never logged: URLs are redacted before any log/exception message.
"""
from __future__ import annotations

import io
import logging
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
import pandas as pd
from tenacity import (retry, retry_if_exception, stop_after_attempt, wait_exponential,
                      before_sleep_log)

from etl.config import Region, map_key, path, settings

log = logging.getLogger(__name__)
BASE = "https://firms.modaps.eosdis.nasa.gov"

# FIRMS area-API source  ->  country-archive directory (only those that exist, verified)
COUNTRY_DIRS = {"MODIS_SP": "modis", "VIIRS_SNPP_SP": "viirs-snpp", "VIIRS_NOAA20_SP": "viirs-jpss1"}


class FirmsError(RuntimeError):
    pass


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return isinstance(exc, (httpx.TransportError, FirmsError))


class FirmsClient:
    # Stay well under 5000 transactions / 10 min (a big request may count as several).
    MIN_INTERVAL_S = 0.5

    def __init__(self, key: str | None = None):
        self.key = key or map_key()
        if not self.key:
            raise SystemExit("FIRMS_MAP_KEY is not set. Add it to .env, or run with --mode sample.")
        cfg = settings()["extract"]
        self.http = httpx.Client(timeout=httpx.Timeout(300, connect=30), follow_redirects=True)
        self._last = 0.0
        self._get = retry(
            retry=retry_if_exception(_retryable),
            stop=stop_after_attempt(cfg["max_retries"]),
            wait=wait_exponential(multiplier=cfg["backoff_seconds"], max=120),
            before_sleep=before_sleep_log(log, logging.WARNING),
            reraise=True,
        )(self._get_once)

    def _redact(self, s: str) -> str:
        return s.replace(self.key, "***")

    def _get_once(self, url: str) -> httpx.Response:
        wait = self.MIN_INTERVAL_S - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        try:
            r = self.http.get(url)
            if r.status_code == 400 and r.text.startswith("Exceeding"):
                time.sleep(90)
                raise FirmsError(r.text[:200])
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise httpx.HTTPStatusError(self._redact(str(e)), request=e.request,
                                        response=e.response) from None
        # FIRMS returns 200 with a plain-text error for bad keys/params or exceeded limits.
        head = r.text[:200] if r.headers.get("content-type", "").startswith("text") else ""
        if head.startswith(("Invalid", "Error", "Exceeding")):
            if head.startswith("Exceeding"):
                time.sleep(60)
                raise FirmsError(head)
            raise SystemExit(f"FIRMS rejected the request: {self._redact(head)}")
        return r

    # -------------------------------------------------------------- endpoints
    def availability(self) -> pd.DataFrame:
        r = self._get(f"{BASE}/api/data_availability/csv/{self.key}/ALL")
        return pd.read_csv(io.StringIO(r.text), parse_dates=["min_date", "max_date"])

    def area(self, source: str, region: Region, start: date, days: int) -> pd.DataFrame:
        """One area-API window, cached in data/raw/area/."""
        if not 1 <= days <= 5:
            raise ValueError("FIRMS area API DAY_RANGE must be 1..5")
        cache = path("raw_cache") / "area" / region.key / source / f"{start:%Y-%m-%d}_{days}d.csv.gz"
        if cache.exists():
            return pd.read_csv(cache, dtype={"acq_time": str})
        url = f"{BASE}/api/area/csv/{self.key}/{source}/{region.bbox_str}/{days}/{start:%Y-%m-%d}"
        df = pd.read_csv(io.StringIO(self._get(url).text), dtype={"acq_time": str})
        cache.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(cache, index=False, compression="gzip")
        return df

    def area_range(self, source: str, region: Region, start: date, end: date) -> pd.DataFrame:
        step = settings()["extract"]["window_days"]
        windows, d = [], start
        while d <= end:
            windows.append((d, min(step, (end - d).days + 1)))
            d += timedelta(days=step)
        parts = []
        for i, (d, n) in enumerate(windows, 1):
            parts.append(self.area(source, region, d, n))
            if i % 20 == 0 or i == len(windows):
                log.info("  %s %s: %d/%d windows", source, region.key, i, len(windows))
        parts = [p for p in parts if len(p)]
        return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()

    def country_year(self, source: str, year: int, region: Region, country: str = "Brazil") -> pd.DataFrame:
        """Yearly standard-processing archive for a country, clipped to the region bbox.

        Only the clipped file is cached (data/raw/country/); the national file is deleted.
        """
        d = COUNTRY_DIRS[source]
        cache = path("raw_cache") / "country" / region.key / f"{source}_{year}.csv.gz"
        if cache.exists():
            return pd.read_csv(cache, dtype={"acq_time": str})
        tmp = path("raw_cache") / "country" / f"{d}_{year}_{country}.csv"
        if not tmp.exists():
            tmp.parent.mkdir(parents=True, exist_ok=True)   # fresh checkout: data/raw/country/ absent
            url = f"{BASE}/data/country/{d}/{year}/{d}_{year}_{country}.csv"
            log.info("  downloading %s %d (%s, national file)...", source, year, country)
            with self.http.stream("GET", url) as r:
                if r.status_code == 404:
                    log.warning("  %s %d not in country archive", source, year)
                    return pd.DataFrame()
                r.raise_for_status()
                part = tmp.with_suffix(".part")
                with open(part, "wb") as f:
                    for chunk in r.iter_bytes(1 << 20):
                        f.write(chunk)
                part.replace(tmp)
        w, s, e, n = region.bbox
        clipped = [
            c[(c.longitude >= w) & (c.longitude <= e) & (c.latitude >= s) & (c.latitude <= n)]
            for c in pd.read_csv(tmp, dtype={"acq_time": str}, chunksize=500_000)
        ]
        df = pd.concat(clipped, ignore_index=True)
        cache.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(cache, index=False, compression="gzip")
        tmp.unlink()
        log.info("  %s %d: %s rows in %s", source, year, f"{len(df):,}", region.key)
        return df


def read_sample(region: Region) -> dict[str, pd.DataFrame]:
    """Bundled SYNTHETIC sample (data/sample/), for offline runs."""
    out = {}
    for f in sorted(Path(path("sample")).glob(f"*_{region.key}.csv.gz")):
        product = f.name.removesuffix(f"_{region.key}.csv.gz")
        out[product] = pd.read_csv(f, dtype={"acq_time": str})
    if not out:
        raise SystemExit(f"No sample files for region '{region.key}' in data/sample/. "
                         f"Run: python tasks.py sample")
    return out
