"""Lite history for regions without per-cell tables (the 'live' tier).

  python -m etl.pipelines.lite --region brasil_amazonia [--no-load]
  python -m etl.pipelines.lite --all

Streams the FIRMS area API year by year (nothing cached, detections discarded), reduces each year
to regional daily fire-cell-day counts, harmonizes MODIS->VIIRS and writes only the regional tables
(regional_daily, monthly_region_stats, calibration_metrics). No hex grid / forecast / raw hotspots.
Simplification vs the full pipeline: no static-source mask (FIRMS `type` filter still applies).
"""
from __future__ import annotations

import argparse
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import io
import threading

import pandas as pd

from etl.config import get_region, regions, path, settings
from etl.extract.firms import BASE, FirmsClient
from etl.load import db
from etl.load.load import log_run
from etl.transform import aggregate, harmonize, normalize, quality

log = logging.getLogger("lite")
SOURCES = ["MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP"]
NRT = {"MODIS_NRT": "MODIS_SP", "VIIRS_NOAA20_NRT": "VIIRS_NOAA20_SP", "VIIRS_NOAA21_NRT": "VIIRS_NOAA20_SP"}
WORKERS = 2


_QUOTA = {"t": 0.0, "lock": threading.Lock()}


def _budget(client: FirmsClient, high: int = 4600, low: int = 2500) -> None:
    """Stay under FIRMS' 5000 transactions / 10 min: poll the key status, pause when close to the cap."""
    with _QUOTA["lock"]:
        while True:
            if time.monotonic() - _QUOTA["t"] < 15:
                return
            try:
                cur = int(client.http.get(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={client.key}").json()["current_transactions"])
            except Exception:
                return
            _QUOTA["t"] = time.monotonic()
            if cur < high:
                return
            log.info("FIRMS quota at %d/5000: waiting for it to drop below %d", cur, low)
            time.sleep(60)
            if cur < low:
                return


def _window(client: FirmsClient, src, region, d: date, n: int) -> pd.DataFrame:
    _budget(client)
    url = f"{BASE}/api/area/csv/{client.key}/{src}/{region.bbox_str}/{n}/{d:%Y-%m-%d}"
    return pd.read_csv(io.StringIO(client._get(url).text), dtype={"acq_time": str})


def _fetch(clients, src, region, start: date, end: date) -> pd.DataFrame:
    step = settings()["extract"]["window_days"]
    wins, d = [], start
    while d <= end:
        wins.append((d, min(step, (end - d).days + 1)))
        d += timedelta(days=step)

    def one(i):
        return _window(clients[i % len(clients)], src, region, *wins[i])
    with ThreadPoolExecutor(len(clients)) as ex:
        parts = [p for p in ex.map(one, range(len(wins))) if len(p)]
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()


def run(region_key: str, load_db: bool = True) -> dict:
    region = get_region(region_key)
    cfg = settings()
    clients = [FirmsClient() for _ in range(WORKERS)]
    avail = clients[0].availability().set_index("data_id")
    first = date.fromisoformat(cfg["extract"]["history_start"])
    # (product, start, end) per source, then NRT after the SP coverage ends
    plan = {}
    for s in SOURCES:
        plan[s] = (max(first, avail.loc[s, "min_date"].date()), avail.loc[s, "max_date"].date())
    snpp_end = plan["VIIRS_SNPP_SP"][1]
    n20 = plan["VIIRS_NOAA20_SP"]
    # NOAA-20 only matters once SNPP (the reference) stops: skipping the overlap halves the VIIRS cost
    plan["VIIRS_NOAA20_SP"] = (max(n20[0], snpp_end + timedelta(days=1)), n20[1])
    if plan["VIIRS_NOAA20_SP"][0] > plan["VIIRS_NOAA20_SP"][1]:
        del plan["VIIRS_NOAA20_SP"]
    today = date.today()
    for n, sp in NRT.items():
        if sp not in plan:
            plan[sp] = (avail.loc[sp, "max_date"].date(),) * 2
        a = plan[sp][1] + timedelta(days=1)
        b = min(today, avail.loc[n, "max_date"].date())
        if a <= b:
            plan[n] = (max(a, avail.loc[n, "min_date"].date()), b)
    spans = {p: (pd.Timestamp(a), pd.Timestamp(b)) for p, (a, b) in plan.items()}
    # satellites per product, for the one-reference-satellite-per-day rule
    sat_of = {"VIIRS_SNPP_SP": "SNPP", "VIIRS_NOAA20_SP": "NOAA20", "VIIRS_NOAA20_NRT": "NOAA20",
              "VIIRS_NOAA21_NRT": "NOAA21"}
    vsp = pd.DataFrame([{"satellite": sat_of[p], "min": a, "max": b} for p, (a, b) in spans.items() if p in sat_of])
    ref_days = aggregate.viirs_reference_days(vsp, cfg["harmonization"]["viirs_reference_priority"])
    t0 = time.time()
    years = range(min(a.year for a, _ in plan.values()), max(b.year for _, b in plan.values()) + 1)
    daily = []
    ck = path("processed") / "_lite" / region_key
    ck.mkdir(parents=True, exist_ok=True)
    for y in years:
        lo, hi = date(y, 1, 1), date(y, 12, 31)
        f = ck / f"{y}.parquet"
        if f.exists() and y < today.year - 1:          # recent years are always refetched
            daily.append(pd.read_parquet(f)); continue
        raw = []
        for p, (a, b) in plan.items():
            a2, b2 = max(a, lo), min(b, hi)
            if a2 <= b2:
                raw.append((p, _fetch(clients, p, region, a2, b2)))
        det = normalize.normalize_all(raw)
        if det.empty:
            continue
        det, _ = quality.apply_filters(det, None)
        det = aggregate.add_h3(det, cfg["transform"]["h3_resolution"])
        hs = det.groupby("date").size().rename("hotspots_total")
        det = aggregate.mark_viirs_reference(det, ref_days)
        dd = aggregate.dedup_cross_satellite(det)
        cells = aggregate.daily_cell_counts(dd, ref_det=det[det.viirs_ref])
        r = aggregate.regional_daily(cells, pd.Timestamp(lo), pd.Timestamp(hi))
        r["hotspots_total"] = r["date"].map(hs).fillna(0).astype(int)
        r.to_parquet(f, index=False)
        daily.append(r)
        log.info("%s %d: %s detections, %.0fs", region_key, y, f"{len(det):,}", time.time() - t0)
        del det, dd, cells
    regional = pd.concat(daily, ignore_index=True)
    # drop leading/trailing days outside any product coverage
    cov_lo = min(a for a, _ in spans.values()); cov_hi = max(b for _, b in spans.values())
    regional = regional[(regional.date >= cov_lo) & (regional.date <= cov_hi)].reset_index(drop=True)
    regional["viirs_ref_sat"] = regional["date"].map(ref_days)

    def days(prefix):
        idx = [pd.date_range(a, b, freq="D") for p, (a, b) in spans.items() if p.startswith(prefix)]
        out = idx[0]
        for i in idx[1:]:
            out = out.union(i)
        return out
    empty_cells = pd.DataFrame({"date": pd.to_datetime([]), "viirs_fire": [], "modis_fire": []})
    hz = harmonize.harmonize(regional, empty_cells, days("MODIS"), days("VIIRS"), cfg["harmonization"]["method"],
                             tuple(cfg["harmonization"].get("calibration_years") or ()) or None)
    monthly = harmonize.monthly_stats(hz.regional)
    od = path("processed") / region_key
    od.mkdir(parents=True, exist_ok=True)
    hz.regional.to_parquet(od / "regional_daily.parquet", index=False)
    monthly.to_parquet(od / "monthly_region_stats.parquet", index=False)
    hz.metrics.to_csv(od / "calibration_metrics.csv", index=False)
    info = {"regional_daily": len(hz.regional), "monthly_region_stats": len(monthly)}
    if load_db:
        started = datetime.now(timezone.utc)
        run_id = f"{region_key}-lite-{started:%Y%m%dT%H%M%S}"
        db.create_schema()
        r_ = hz.regional.assign(region=region_key)
        db.replace_where("regional_daily", r_, region=region_key,
                         date=(r_["date"].min().date(), r_["date"].max().date()))
        db.replace_where("monthly_region_stats", monthly.assign(region=region_key), region=region_key)
        db.replace_where("calibration_metrics",
                         hz.metrics.assign(region=region_key, computed_at=datetime.now(timezone.utc)), region=region_key)
        log_run(run_id, region_key, "lite", "success", started, info)
    log.info("%s done in %.0fs: %s", region_key, time.time() - t0, info)
    return info


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--no-load", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    def area(r):
        w, s_, e, n = r.bbox
        return (e - w) * (n - s_)
    keys = [r.key for r in sorted((r for r in regions().values() if r.live), key=area)] if a.all else [a.region]
    log.info("queue (smallest first): %s", keys)
    for k in keys:
        try:
            run(k, not a.no_load)
        except BaseException as e:   # keep the queue going
            log.error("%s FAILED: %s: %s", k, type(e).__name__, e)
            if not a.all:
                raise


if __name__ == "__main__":
    main()
