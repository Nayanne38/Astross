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

## Educação e ODS
Cada visualização da API traz um bloco `learn`: textos explicativos determinísticos em pt-BR, com três
níveis de linguagem, o bloco obrigatório "o que este dado NÃO diz", avisos de procedência, perguntas
guiadas e texto acessível. Há ainda `GET /glossary`, `GET /learn/paths` e `GET /provenance`.
Para quais metas da ONU o projeto contribui e o que ele não afirma: [docs/ODS.md](docs/ODS.md).
Diagnóstico completo do conselho de especialistas: [docs/EDUCACAO_ODS.md](docs/EDUCACAO_ODS.md).
Para rodar o conselho de novo, use o workflow salvo em `.claude/workflows/conselho-ods-educacao.js`.

## License
Code: MIT ([LICENSE](LICENSE)). Derived data and educational content: CC BY 4.0 ([DATA_LICENSE.md](DATA_LICENSE.md)).
