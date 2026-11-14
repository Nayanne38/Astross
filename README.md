# Calendário de Queimadas

NASA Space Apps Challenge 2026 — *Harmonization of MODIS & VIIRS Hot Spots*.

Harmonizes NASA FIRMS active-fire detections from MODIS and VIIRS into one consistent
time series (H3 fire-cell-days, MODIS calibrated to a VIIRS-equivalent scale), stores it via a
reproducible ETL, serves it with FastAPI and shows it in a pt-BR web app (calendar, map,
dashboard, export), plus an ML fire-risk forecast.

> Status: **Phase 0** (skeleton). See [docs/PLAN.md](docs/PLAN.md).

## Quick start
Requirements: Python 3.11+, Node 20+. Docker is optional (SQLite fallback is the default).

```bash
python tasks.py setup      # venv + deps + .env   (Unix: make setup)
python tasks.py sample     # regenerate the SYNTHETIC offline sample
python tasks.py test
```

Targets (same names in `make`): `setup db-up sample etl etl-incremental train forecast api web test demo`.

## Data
Uses NASA FIRMS. Put your MAP_KEY in `.env` (`FIRMS_MAP_KEY`); never commit it.
`data/sample/` is **synthetic**, for offline testing only — see its README.

Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS),
parte do NASA LANCE e do ESDIS — https://earthdata.nasa.gov/firms
