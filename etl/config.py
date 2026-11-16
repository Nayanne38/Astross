"""Central configuration: YAML settings + regions + environment (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Region:
    key: str
    name: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    timezone_offset_hours: int = -3
    name_en: str = ""
    group: str = ""
    live: bool = False  # NRT-only monitoring tier: no history in the DB

    @property
    def bbox_str(self) -> str:
        """FIRMS area API format: west,south,east,north."""
        return ",".join(f"{v:g}" for v in self.bbox)


@lru_cache
def settings() -> dict:
    with open(ROOT / "config" / "settings.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache
def regions() -> dict[str, Region]:
    with open(ROOT / "config" / "regions.yaml", encoding="utf-8") as f:
        raw = yaml.safe_load(f)["regions"]
    return {
        k: Region(key=k, name=v["name"], bbox=tuple(v["bbox"]),
                  timezone_offset_hours=v.get("timezone_offset_hours", -3),
                  name_en=v.get("name_en", v["name"]), group=v.get("group", ""), live=bool(v.get("live", False)))
        for k, v in raw.items()
    }


def get_region(key: str | None = None) -> Region:
    key = key or os.getenv("REGION") or settings()["default_region"]
    try:
        return regions()[key]
    except KeyError:
        raise SystemExit(f"Unknown region '{key}'. Available: {', '.join(regions())} "
                         f"(edit config/regions.yaml)") from None


def path(name: str) -> Path:
    p = ROOT / settings()["paths"][name]
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError:          # read-only filesystem (serverless): reads still work, nothing is written here
        pass
    return p


def map_key() -> str | None:
    """FIRMS MAP_KEY from .env. Never log the value."""
    return os.getenv("FIRMS_MAP_KEY") or None


def database_url() -> str:
    backend = os.getenv("DB_BACKEND", "sqlite").lower()
    if backend in ("postgres", "supabase"):
        url = os.getenv("DATABASE_URL", "")
        if not url:
            raise SystemExit("DB_BACKEND=%s but DATABASE_URL is empty (see .env.example)" % backend)
        # Accept the plain URI Supabase shows ("postgresql://...") and use the psycopg3 driver.
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg://" + url[len(prefix):]
        if backend == "supabase" and "sslmode=" not in url:
            url += ("&" if "?" in url else "?") + "sslmode=require"
        return url
    if backend == "sqlite":
        p = ROOT / os.getenv("SQLITE_PATH", "data/queimadas.db")
        p.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{p.as_posix()}"
    raise SystemExit(f"DB_BACKEND must be 'sqlite', 'postgres' or 'supabase', got '{backend}'")
