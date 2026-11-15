# Plan — Calendário de Queimadas (NASA Space Apps 2026)

Challenge: *Harmonization of MODIS & VIIRS Hot Spots*. Budget: ~36 h. Strategy: one
working vertical slice (one region, end to end) first, polish later.

## Environment findings (dev machine)
- Python 3.14, Node 26, git available. **Docker and `make` are NOT installed.**
  - DB: `DB_BACKEND=sqlite` (default on this machine) or `DB_BACKEND=postgres` (docker-compose PostGIS).
    All SQL goes through SQLAlchemy; PostGIS-only bits (geometry columns) are optional extras.
  - Tasks: `Makefile` for Linux/macOS teammates **and** `python tasks.py <target>` with the same
    targets for Windows. The Makefile just calls `tasks.py`, so there is one source of truth.
- No existing v0 frontend was found on disk, so `/web` will be created from scratch
  (Next.js App Router + TS + Tailwind + shadcn/ui + Recharts + react-leaflet). If the v0 export
  shows up later, we adapt it and keep `lib/fire-data.ts` names/interfaces.

## Pilot region
Cerrado / Matopiba, bbox configured in `config/regions.yaml`. A small `sample_tocantins`
region (2°×2°) backs the bundled offline sample.

## Data flow
```
FIRMS (area API, archive SP + NRT) ──► data/raw/ (cache, one file per source×window)
   └─► normalize (common schema) ─► quality filters ─► dedup
        └─► H3 res-6 aggregation: fire-cell-days per sensor family
             └─► MODIS→VIIRS calibration (monthly quantile mapping on overlap 2012+,
                 hold-out years) ─► harmonized_count
                  └─► load: raw_hotspots, daily_cell_counts, monthly_region_stats,
                      calibration_metrics, etl_runs ─► DQ checks
                       └─► ML features ─► LightGBM (temporal split) ─► risk_forecasts
                            └─► FastAPI ─► Next.js (calendar, map, dashboard, export)
```

## Phases (stop & report after each)
| # | Deliverable | Done when |
|---|-------------|-----------|
| 0 | Plan, skeleton, compose, Makefile/tasks.py, sample data | `python tasks.py test` passes on skeleton; sample generated |
| 1 | Extract (FIRMS, verified against docs) + normalize + H3 + harmonization; METHODOLOGY draft + before/after plot | Runs on sample offline; runs on real Matopiba if MAP_KEY present |
| 2 | Load (SQLite/PostGIS, idempotent) + DQ checks + Apache Hop project | `tasks.py etl` fills DB, DQ report printed |
| 3 | FastAPI endpoints + tests | `/docs` works; pytest green |
| 4 | Next.js: calendar, filters/palettes, dashboard, map, CSV/PNG export, Harmonização tab | `tasks.py web` shows real API data |
| 5 | ML features/train/evaluate/forecast + Previsão tab | metrics vs persistence & climatology documented honestly |
| 6 | Docs, `demo`, limitations | teammate runs `demo` in < 10 min |

Cut order if late: Hop polish → 14/30-day horizons → weather features → multi-region.
Never cut: harmonization, calendar, filters, CSV export, honest evaluation.

## Key decisions (changeable)
- **Unit of harmonization:** fire-cell-day on H3 res 6 (~36 km²), per sensor family, after
  cross-satellite dedup (Terra+Aqua → one MODIS flag; SNPP+NOAA-20(+NOAA-21) → one VIIRS flag).
- **Calibration:** per region × calendar month, quantile mapping of daily regional MODIS
  fire-cell-day counts to VIIRS on the overlap period; linear regression as a reported
  baseline. Validation by leaving whole years out.
- **Near real time:** MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT only (Suomi NPP stopped
  delivering on 2026-11-02). Suomi NPP SP is used for history.
- **ML target:** P(cell has ≥1 fire-cell-day in next 7 days). Strict temporal split;
  baselines: persistence, climatology.

## Educational layer (UN SDG 4.7 / 4.4 / 13.3 / 15.1 / 16.10 / 17.18)
Deterministic pt-BR explanations on every view (`learn` block, `api/education.py`), glossary
(`GET /glossary`), learning paths (`GET /learn/paths`), provenance (`GET /provenance`) and honesty
tests (`tests/test_education.py`). Council diagnosis and roadmap: `docs/EDUCACAO_ODS.md`; claims
matrix: `docs/ODS.md`. Phase 4 must render `learn` next to every chart (see `web/README.md`).

## Honesty rules
- The bundled `data/sample/` is **synthetic** (clearly labelled), only for offline tests/demo.
  Real results come only from FIRMS downloads and are reported as such.
- FIRMS limits/source names get verified from the official docs in Phase 1 and recorded in
  `docs/DATA_DICTIONARY.md`; anything unverified is flagged.

## Open question for the team
- "Apache Hop" is assumed for orchestration. If you meant something else (Airflow, Prefect,
  Dagster), change it now — it only affects `/hop`, the Python pipeline is standalone.
