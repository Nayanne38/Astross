"""Snapshot API responses into web/public/cache/<cacheKey>.json.

The web app falls back to these files when the FastAPI is slow or down (see web/lib/api.ts) and
says so on screen. The file name rule must match `cacheKey()` in web/lib/api.ts exactly, and the
params below must match what each screen sends in its default state (filters other than the
period at their defaults). If a screen changes its params, update REQUESTS here too.

Usage:
    python scripts/cache_api.py                      # default region, all periods
    python scripts/cache_api.py --periods serie,30d  # fewer periods
    python scripts/cache_api.py --api http://localhost:8000 --all-regions
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "cache"
PERIOD_DAYS = {"5a": 5 * 365, "12m": 365, "30d": 30, "1d": 1}
POINT_DAYS = 60  # web/app/home-view.tsx


def _s(v) -> str:
    """Stringify like JS String(): booleans become true/false."""
    return ("true" if v else "false") if isinstance(v, bool) else str(v)


def clean(params: dict) -> dict:
    return {k: v for k, v in params.items() if v is not None and v != ""}


def cache_key(path: str, params: dict) -> str:
    p = clean(params)
    tail = "_".join(f"{k}-{_s(p[k])}" for k in sorted(p))
    name = re.sub(r"[/.]", "-", path.lstrip("/")) + (f"__{tail}" if tail else "")
    return re.sub(r"[^a-zA-Z0-9_\-]", "", name)


def filter_range(period: str, data_end: str) -> tuple[str | None, str | None]:
    """Same as filterRange() in web/lib/filters.ts."""
    if period == "serie":
        return None, None
    end = date.fromisoformat(data_end)
    return (end - timedelta(days=PERIOD_DAYS[period] - 1)).isoformat(), data_end


def requests_for(region: dict, periods: list[str]) -> list[tuple[str, dict]]:
    key = region["key"]
    out: list[tuple[str, dict]] = [
        ("/harmonization", {"region": key, "learn": False}),
        ("/forecast", {"region": key, "horizon": 7, "limit": 60000, "boundary": False, "learn": False, "fallback": True}),
        ("/forecast", {"region": key, "limit": 60000, "learn": False, "boundary": False, "fallback": False}),
        ("/forecast", {"region": key, "limit": 1, "learn": False, "fallback": False}),
    ]
    for period in periods:
        rs, re_ = filter_range(period, region["data_end"])
        start, end = rs or region["data_start"], re_ or region["data_end"]
        days = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
        out += [
            # Mapa de focos (home-view.tsx)
            ("/summary", {"region": key, "start": start, "end": end, "learn": False}),
            ("/hexgrid", {"region": key, "start": start, "end": end, "boundary": False, "limit": 100000, "learn": False}),
            ("/recent", {"region": key, "days": min(days, POINT_DAYS), "limit": 30000, "learn": False}),
            # Calendário (calendar-view.tsx): sends the raw range, so "serie" has no start/end
            ("/calendar", {"region": key, "start": rs, "end": re_, "top_n": 3, "learn": True}),
            ("/summary", {"region": key, "start": rs, "end": re_, "learn": False}),
            # Dados completos (data-view.tsx)
            ("/hexgrid", {"region": key, "start": start, "end": end, "boundary": False, "limit": 1, "learn": False}),
        ]
    return out


def fetch(api: str, path: str, params: dict) -> bytes:
    q = urllib.parse.urlencode({k: _s(v) for k, v in clean(params).items()})
    with urllib.request.urlopen(f"{api}{path}{'?' + q if q else ''}", timeout=300) as r:
        return r.read()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--periods", default="serie,5a,12m,30d,1d")
    ap.add_argument("--all-regions", action="store_true")
    a = ap.parse_args()
    periods = [p for p in a.periods.split(",") if p]
    bad = [p for p in periods if p != "serie" and p not in PERIOD_DAYS]
    if bad:
        ap.error(f"unknown period(s): {bad}")

    OUT.mkdir(parents=True, exist_ok=True)
    try:
        meta_raw = fetch(a.api, "/meta", {})
    except OSError as e:
        print(f"API not reachable at {a.api} ({e}). Start it with: python tasks.py api", file=sys.stderr)
        return 1
    meta = json.loads(meta_raw)
    jobs: list[tuple[str, dict]] = [("/meta", {}), ("/glossary", {"nivel": "simples"})]
    regions = [r for r in meta["regions"] if a.all_regions or r["key"] == meta["default_region"]]
    for r in regions:
        jobs += requests_for(r, periods)

    seen, total, failed = set(), 0, 0
    for path, params in jobs:
        name = cache_key(path, params)
        if name in seen:
            continue
        seen.add(name)
        try:
            body = meta_raw if path == "/meta" else fetch(a.api, path, params)
        except OSError as e:
            failed += 1
            print(f"  FAIL {name}: {e}", file=sys.stderr)
            continue
        (OUT / f"{name}.json").write_bytes(body)
        total += len(body)
        print(f"  {len(body) / 1024:9.1f} KB  {name}.json")
    print(f"{len(seen) - failed} files, {total / 1_048_576:.1f} MB in {OUT}" + (f" ({failed} failed)" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
