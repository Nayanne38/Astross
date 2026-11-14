"""Decide which FIRMS products/periods to pull for a region and fetch them (cached).

Full history (mode=full):
  1. Yearly country archive (standard processing) for history_start.year .. last archived year:
     MODIS_SP (Terra+Aqua), VIIRS_SNPP_SP (2012-01-20+), VIIRS_NOAA20_SP (2018-04+).
  2. Area API, *_SP sources, for the rest of the SP period (archive files lag ~1 year).
  3. Area API, NRT sources (MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT) from the day after
     each family's SP coverage ends until today. VIIRS_SNPP_NRT is deliberately NOT used
     (Suomi NPP stopped delivering on 2026-11-02).
Incremental (mode=incremental): NRT sources for the last `days` days.
Sample (mode=sample): bundled synthetic files, no network.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import pandas as pd

from etl.config import Region, settings
from etl.extract.firms import COUNTRY_DIRS, FirmsClient, read_sample

log = logging.getLogger(__name__)
VIIRS_SP_FOR_NRT_GAP = "VIIRS_NOAA20_SP"  # VIIRS NRT starts after this source's SP coverage


def _concat(parts: list[pd.DataFrame]) -> pd.DataFrame:
    parts = [p for p in parts if len(p)]
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def extract(region: Region, mode: str = "full", days: int = 7,
            today: date | None = None) -> dict[str, pd.DataFrame]:
    """Convenience wrapper: everything in memory (fine for sample/incremental, not full history)."""
    out: dict[str, list[pd.DataFrame]] = {}
    for product, df in iter_extract(region, mode, days, today):
        out.setdefault(product, []).append(df)
    return {k: _concat(v) for k, v in out.items()}


def iter_extract(region: Region, mode: str = "full", days: int = 7, today: date | None = None):
    """Yield (product, raw FIRMS DataFrame) chunks — one per year/range — to bound memory."""
    if mode == "sample":
        out = read_sample(region)
        log.info("extract[sample]: %s", {k: len(v) for k, v in out.items()})
        yield from out.items()
        return

    cfg = settings()["extract"]
    client = FirmsClient()
    today = today or date.today()
    avail = client.availability().set_index("data_id")
    log.info("FIRMS availability: %s", {k: f"{r.min_date:%Y-%m-%d}..{r.max_date:%Y-%m-%d}"
                                       for k, r in avail.iterrows() if k in
                                       set(cfg["history_sources"]) | set(cfg["nrt_sources"])})
    counts: dict[str, int] = {}

    def emit(src, df):
        counts[src] = counts.get(src, 0) + len(df)
        return src, df

    if mode == "full":
        first_year = date.fromisoformat(cfg["history_start"]).year
        for src in cfg["history_sources"]:
            sp_min = avail.loc[src, "min_date"].date()
            sp_max = avail.loc[src, "max_date"].date()
            covered_until = date(max(first_year, sp_min.year) - 1, 12, 31)
            if src in COUNTRY_DIRS:
                for y in range(max(first_year, sp_min.year), sp_max.year + 1):
                    df = client.country_year(src, y, region)
                    if df.empty and y >= sp_max.year - 1:
                        break  # not archived yet -> area API below
                    yield emit(src, df)
                    covered_until = date(y, 12, 31)
            start = max(covered_until + timedelta(days=1), sp_min)
            if start <= sp_max:
                log.info("%s via area API %s..%s", src, start, sp_max)
                yield emit(src, client.area_range(src, region, start, sp_max))
        nrt_start = {
            "MODIS_NRT": avail.loc["MODIS_SP", "max_date"].date() + timedelta(days=1),
            "VIIRS_NOAA20_NRT": avail.loc[VIIRS_SP_FOR_NRT_GAP, "max_date"].date() + timedelta(days=1),
            "VIIRS_NOAA21_NRT": avail.loc[VIIRS_SP_FOR_NRT_GAP, "max_date"].date() + timedelta(days=1),
        }
    elif mode == "incremental":
        nrt_start = {s: today - timedelta(days=days - 1) for s in cfg["nrt_sources"]}
    else:
        raise ValueError(f"unknown mode {mode}")

    for src in cfg["nrt_sources"]:
        if "SNPP" in src:
            raise SystemExit("VIIRS_SNPP_NRT must not be used (Suomi NPP stopped 2026-11-02).")
        start = max(nrt_start[src], avail.loc[src, "min_date"].date())
        end = min(today, avail.loc[src, "max_date"].date())
        if start <= end:
            log.info("%s via area API %s..%s", src, start, end)
            yield emit(src, client.area_range(src, region, start, end))
    log.info("extract[%s]: %s", mode, counts)
