"""Daily worker: download fresh worldwide FIRMS detections and keep only the last 30 days.

  python -m etl.worker              # one refresh now (backfills any missing day of the last 30), then exit
  python -m etl.worker --loop       # keep running: refresh every --every-hours (default 3), purge each time
  python tasks.py worker            # same as --loop

Each refresh re-downloads today and yesterday (NRT files grow during the day) and any day of the window
that is missing. Days older than the retention window are deleted. Quota use is bounded by the same
governor as the history pipeline (FIRMS allows 5000 transactions / 10 min).
"""
from __future__ import annotations

import argparse
import io
import logging
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

from alerts import firms_live
from etl import live_store
from etl.config import map_key
from etl.extract.firms import FirmsClient

log = logging.getLogger("worker")
WORLD = "-180,-90,180,90"


def _fetch(client: FirmsClient, src: str, start, n: int):
    from etl.pipelines.lite import _budget
    _budget(client)
    url = f"{firms_live.BASE}/{map_key()}/{src}/{WORLD}/{n}/{start:%Y-%m-%d}"
    text = client._get(url).text.strip()
    if not text or text.lower().startswith(("invalid", "error")):
        return []
    return firms_live._parse(pd.read_csv(io.StringIO(text)), src)


def refresh(retention: int = live_store.RETENTION_DAYS) -> dict:
    client = FirmsClient()
    today = datetime.now(timezone.utc).date()
    window = [today - timedelta(days=i) for i in range(retention - 1, -1, -1)]
    have = set(live_store.days_present())
    todo = [d for d in window if d not in have or d >= today - timedelta(days=1)]
    fetched = 0
    i = 0
    while i < len(todo):                       # group consecutive days into windows of up to 5
        j = i
        while j + 1 < len(todo) and (todo[j + 1] - todo[j]).days == 1 and j + 1 - i < 4:
            j += 1
        start, n = todo[i], j - i + 1
        for src in firms_live.SOURCES:
            try:
                fires = _fetch(client, src, start, n)
            except Exception as e:             # one failing source/window must not stop the refresh
                log.warning("%s %s +%dd failed: %s", src, start, n, type(e).__name__)
                continue
            fetched += live_store.save(fires) and len(fires)
        i = j + 1
    purged = live_store.purge(retention)
    days = live_store.days_present()
    log.info("refresh done: %d detections stored, %d day file(s) kept (%s..%s), %d purged",
             fetched, len(days), days[0] if days else "-", days[-1] if days else "-", purged)
    return {"fetched": fetched, "days": len(days), "purged": purged}


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--every-hours", type=float, default=3.0)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    while True:
        try:
            refresh()
        except Exception as e:
            log.error("refresh failed: %s: %s", type(e).__name__, e)
            if not a.loop:
                raise
        if not a.loop:
            break
        time.sleep(a.every_hours * 3600)


if __name__ == "__main__":
    main()
