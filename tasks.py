"""Cross-platform task runner (Windows has no `make`). The Makefile delegates here.

Usage: python tasks.py <target> [args...]
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(*cmd, cwd=ROOT, env=None) -> None:
    print(f"$ {' '.join(map(str, cmd))}", flush=True)
    r = subprocess.run(list(map(str, cmd)), cwd=cwd, env={**os.environ, **(env or {})})
    if r.returncode:
        sys.exit(r.returncode)


def py(*args, env=None) -> None:
    run(PY if PY.exists() else sys.executable, *args, env=env)


def not_yet(phase: int):
    def _f(*_):
        sys.exit(f"Not implemented yet (planned for Phase {phase}, see docs/PLAN.md).")
    return _f


def setup(*_):
    if not PY.exists():
        run(sys.executable, "-m", "venv", VENV)
    py("-m", "pip", "install", "-r", "requirements.txt")
    if not (ROOT / ".env").exists():
        shutil.copy(ROOT / ".env.example", ROOT / ".env")
        print("Created .env from .env.example — add FIRMS_MAP_KEY to use real data.")
    if (ROOT / "web" / "package.json").exists() and shutil.which("npm"):
        run("npm", "install", cwd=ROOT / "web")


def db_up(*_):
    if not shutil.which("docker"):
        sys.exit("Docker not found. Use DB_BACKEND=sqlite in .env (default) or install Docker.")
    run("docker", "compose", "up", "-d", "db")


def sample(*_):
    py("scripts/make_sample.py")


def etl(*args):
    """python tasks.py etl [--mode sample|full] [--region KEY]"""
    py("-m", "etl.pipelines.run", *(args or ("--mode", "full")))


def etl_incremental(*args):
    py("-m", "etl.pipelines.run", "--mode", "incremental", *args)


def api(*args):
    py("-m", "uvicorn", "api.main:app", "--reload", "--port", os.getenv("API_PORT", "8000"), *args)


def train(*args):
    py("-m", "ml.train", *args)


def forecast(*args):
    py("-m", "ml.forecast", *args)


def web(*args):
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm not found. Install Node.js 20+.")
    if not (ROOT / "web" / "node_modules").exists():
        run(npm, "install", cwd=ROOT / "web")
    run(npm, "run", *(args or ("dev",)), cwd=ROOT / "web")


def bot(*args):
    """Telegram fire-alert bot + periodic FIRMS scan (needs TELEGRAM_BOT_TOKEN)."""
    py("-m", "alerts.bot", *args)


def test(*args):
    py("-m", "pytest", "-q", *args)


TARGETS = {
    "setup": setup,
    "db-up": db_up,
    "sample": sample,
    "test": test,
    "etl": etl,
    "etl-incremental": etl_incremental,
    "train": train,
    "forecast": forecast,
    "api": api,
    "web": web,
    "bot": bot,
    "demo": not_yet(6),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in TARGETS:
        sys.exit(f"usage: python tasks.py <{'|'.join(TARGETS)}>")
    TARGETS[sys.argv[1]](*sys.argv[2:])
