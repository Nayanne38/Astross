# Astross — Calendário de Queimadas

NASA Space Apps Challenge 2026 — *Harmonization of MODIS & VIIRS Hot Spots*.

Harmonizes NASA FIRMS active-fire detections from MODIS and VIIRS into one consistent
time series (H3 fire-cell-days, MODIS calibrated to a VIIRS-equivalent scale), stores it via a
reproducible ETL (Supabase/Postgres or SQLite), serves it with FastAPI and shows it in a pt-BR
Next.js app, with a hybrid fire-risk forecast (LightGBM + Claude) and a teachers' page.

> Status: **Phases 0–5 done** (Phase 6 — `demo` — pending). See [docs/PLAN.md](docs/PLAN.md) and
> [docs/APRESENTACAO.md](docs/APRESENTACAO.md).

## Quick start
Requirements: Python 3.11+, Node 20+. Docker is optional (SQLite fallback).

```bash
python tasks.py setup      # venv + deps + .env   (Unix: make setup)
python tasks.py etl        # FIRMS -> H3 -> harmonization -> DB (needs FIRMS_MAP_KEY)
python tasks.py train      # 7-day risk model + metrics vs baselines (data/processed/<region>/ml_metrics.json)
python tasks.py forecast   # writes risk_forecasts
python tasks.py api        # http://localhost:$API_PORT/docs (default 8000)
python tasks.py web        # http://localhost:3000
python tasks.py test
```

Targets (same names in `make`): `setup db-up sample etl etl-incremental train forecast api web test demo`.

### Web pages
| Route | What |
|---|---|
| `/` | Painel: summary, current-month anomaly (pt-BR), filters (region, dates, bbox), map, calendar, harmonization chart + validation, CSV export |
| `/previsao` | Risk map (7 days), top cells, Claude analysis, model vs baselines table |
| `/professores` | World map, concepts explained, 3 lesson plans (BNCC), Claude analysis in teacher mode, glossary, CSV downloads |
| `/sobre` | Project presentation: architecture, method, live metrics, timeline, critical notes, NASA challenge checklist |

### Environment (`.env`, never committed)
`FIRMS_MAP_KEY`, `DB_BACKEND` (`supabase`|`postgres`|`sqlite`), `DATABASE_URL` (Supabase **session
pooler**, port 5432), `SQLITE_PATH`, `REGION`, `API_CORS_ORIGINS`, `API_PORT`,
`ANTHROPIC_API_KEY` (server-side only, for `/forecast/insight`), `ANTHROPIC_MODEL`.
The web app reads `NEXT_PUBLIC_API_URL` from `web/.env.local`.

## Alertas de incêndio (Telegram + PWA)

- **`/alertas`** (PWA instalável no celular): botão "Quero receber alertas de incêndio" → cadastro (nome completo,
  telefone, idade, endereço confirmado no mapa, consentimento LGPD; menores precisam de autorização do responsável)
  → QR code / botão que abre o bot no Telegram com um token pessoal → mensagem de boas-vindas + alerta simulado.
- **`/bombeiros`**: cadastro por município (ex.: Aracaju/SE); recebe todos os focos novos na área do município.
- **`/foco`**: página aberta pelo link "ver o local no aplicativo" de cada alerta.
- **Motor** (`alerts/`): a cada `ALERT_INTERVAL_MIN` (15) uma única consulta à API de área do NASA FIRMS
  (VIIRS NOAA-20/21 + MODIS NRT) cobre todos os cadastrados; cidadão = foco a até 10 km; cada foco é enviado
  no máximo uma vez por pessoa (`alert_log`). `/parar` no bot apaga cadastro e histórico.

Para ativar: crie o bot no **@BotFather** (`/newbot`), coloque `TELEGRAM_BOT_TOKEN=` no `.env` (nunca no git) e rode
`python tasks.py bot` junto com `python tasks.py api` e `python tasks.py web`. Sem token, o cadastro funciona e
mostra a prévia da mensagem, mas não há QR. Para o QR funcionar em outro celular, `APP_PUBLIC_URL` e
`NEXT_PUBLIC_API_URL` precisam apontar para endereços acessíveis por ele (não `localhost`).

## Data
Uses NASA FIRMS. `data/sample/` is **synthetic**, for offline testing only — see its README.

Este projeto usa dados do NASA Fire Information for Resource Management System (FIRMS),
parte do NASA LANCE e do ESDIS — https://earthdata.nasa.gov/firms
