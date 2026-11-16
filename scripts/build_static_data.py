"""Pre-generate every JSON/CSV the GitHub Pages edition reads, by calling the FastAPI app in-process.

  python scripts/build_static_data.py [--out web/public/data] [--no-insight]

File names must match staticName() in web/lib/static-data.ts. Needs DATABASE_URL (Supabase) and FIRMS_MAP_KEY;
ANTHROPIC_API_KEY is optional (Claude insights are skipped without it).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

log = logging.getLogger("static")
KEYS = {"/meta": [], "/glossary": [], "/world": ["days"], "/live": ["region", "days"], "/summary": ["region"],
        "/hexgrid": ["region"], "/recent": ["region"], "/forecast": ["region"], "/forecast/live": ["region"],
        "/calendar": ["region"], "/harmonization": ["region"], "/comparison": ["region"],
        "/forecast/insight": ["region", "audience"]}


def static_name(path: str, params: dict) -> str:
    parts = [path.lstrip("/").replace("/", "_")] + [str(params[k]) for k in KEYS[path] if params.get(k) not in (None, "")]
    return ".".join(parts) + ".json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "web/public/data"))
    ap.add_argument("--no-insight", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    c = TestClient(app, raise_server_exceptions=False)
    ok, bad = 0, []

    def grab(path: str, params: dict, extra: dict | None = None) -> dict | None:
        nonlocal ok
        r = c.get(path, params={**params, **(extra or {}), "lang": "en"})
        if r.status_code != 200:
            bad.append((path, params, r.status_code, r.text[:80]))
            return None
        (out / static_name(path, params)).write_bytes(r.content)
        ok += 1
        return r.json()

    meta = grab("/meta", {})
    grab("/glossary", {}, {"nivel": "estudante"})
    for d in (1, 2, 3):
        grab("/world", {"days": d}, {"limit": 25000})
    for rg in meta["regions"]:
        k = rg["key"]
        if k.startswith("sample"):
            continue
        has_series = bool(rg.get("data_start"))
        if rg.get("live"):
            for d in (1, 2, 3):
                grab("/live", {"region": k, "days": d}, {"limit": 30000})
            grab("/forecast/live", {"region": k}, {"limit": 6000})
        if has_series:
            grab("/calendar", {"region": k}, {"learn": True, "nivel": "estudante"})
            grab("/harmonization", {"region": k}, {"learn": True, "nivel": "estudante"})
            grab("/summary", {"region": k}, {"learn": False})
            grab("/comparison", {"region": k}, {})
            r = c.get("/export.csv", params={"region": k, "kind": "monthly"})
            if r.status_code == 200:
                (out / f"export.{k}.monthly.csv").write_bytes(r.content)
                ok += 1
        if not rg.get("live"):          # full (per-cell) region
            grab("/hexgrid", {"region": k}, {"boundary": True, "limit": 12000, "learn": False})
            grab("/recent", {"region": k}, {"days": 7, "limit": 30000})
            fc = grab("/forecast", {"region": k}, {"horizon": 7, "boundary": True, "limit": 8000, "learn": False})
            if fc and fc.get("available") is not False:
                r = c.get("/export.csv", params={"region": k, "kind": "forecast"})
                if r.status_code == 200:
                    (out / f"export.{k}.forecast.csv").write_bytes(r.content)
                    ok += 1
                if not a.no_insight and os.getenv("ANTHROPIC_API_KEY"):
                    for aud in ("geral", "professor"):
                        grab("/forecast/insight", {"region": k, "audience": aud})
    (out / "generated.json").write_text(json.dumps({"files": ok, "failed": len(bad)}))
    log.info("wrote %d files to %s; %d failed", ok, out, len(bad))
    for b in bad:
        log.warning("FAILED %s", b)


if __name__ == "__main__":
    main()
