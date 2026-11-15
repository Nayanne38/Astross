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


def _exe(cmd):
    """Resolve the program (npm is npm.cmd on Windows, which subprocess will not find by bare name)."""
    cmd = list(map(str, cmd))
    return [shutil.which(cmd[0]) or cmd[0], *cmd[1:]]


def run(*cmd, cwd=ROOT, env=None) -> None:
    print(f"$ {' '.join(map(str, cmd))}", flush=True)
    r = subprocess.run(_exe(cmd), cwd=cwd, env={**os.environ, **(env or {})})
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
    py("-m", "uvicorn", "api.main:app", "--reload", "--port", "8000", *args)


WEB = ROOT / "web"
API_URL = "http://localhost:8000"


def _need_npm():
    if not shutil.which("npm"):
        sys.exit("npm not found. Install Node.js 20+ and run: python tasks.py setup")
    if not (WEB / "node_modules").exists():
        run("npm", "install", cwd=WEB)


def web(*args):
    """Next.js dev server on :3000 (start the API first: python tasks.py api)."""
    _need_npm()
    run("npm", "run", "dev", "--", "--port", "3000", *args, cwd=WEB)


def _wait_api(proc, seconds=90) -> None:
    import time
    import urllib.request
    for _ in range(seconds):
        if proc.poll() is not None:
            sys.exit("API exited during start-up. Run `python tasks.py api` to see the error.")
        try:
            urllib.request.urlopen(f"{API_URL}/meta", timeout=2)
            return
        except OSError:
            time.sleep(1)
    sys.exit(f"API did not answer at {API_URL}/meta within {seconds}s.")


def demo(*args):
    """API + production web build, with fresh cache snapshots for the offline fallback.

    python tasks.py demo [--no-build] [--periods serie,30d]
    """
    _need_npm()
    import socket
    for port in (8000, 3000):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                sys.exit(f"Port {port} is already in use. Stop the other server (api/web) and try again.")
    no_build = "--no-build" in args
    rest = [a for a in args if a != "--no-build"]
    py_exe = PY if PY.exists() else Path(sys.executable)
    procs = []
    try:
        print("$ uvicorn api.main:app --port 8000", flush=True)
        api_p = subprocess.Popen([str(py_exe), "-m", "uvicorn", "api.main:app", "--port", "8000", "--no-access-log"], cwd=ROOT)
        procs.append(api_p)
        _wait_api(api_p)
        py("scripts/cache_api.py", "--api", API_URL, *rest)
        if not no_build:
            run("npm", "run", "build", cwd=WEB)
        print("$ npm run start -- --port 3000", flush=True)
        procs.append(subprocess.Popen(_exe(["npm", "run", "start", "--", "--port", "3000"]), cwd=WEB))
        print(f"\nFIRETRACK demo: http://localhost:3000  (API {API_URL}/docs). Ctrl+C to stop.\n", flush=True)
        code = procs[-1].wait()
        if code:
            sys.exit(f"Web server exited with code {code}.")
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()


def test(*args):
    py("-m", "pytest", "-q", *args)


TARGETS = {
    "setup": setup,
    "db-up": db_up,
    "sample": sample,
    "test": test,
    "etl": etl,
    "etl-incremental": etl_incremental,
    "train": not_yet(5),
    "forecast": not_yet(5),
    "api": api,
    "web": web,
    "demo": demo,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in TARGETS:
        sys.exit(f"usage: python tasks.py <{'|'.join(TARGETS)}>")
    TARGETS[sys.argv[1]](*sys.argv[2:])
