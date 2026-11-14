# Data dictionary

## 1. Sources (NASA FIRMS) — verified 2026-11-14

Verified directly against the FIRMS API pages and live calls (not from memory):

| Item | Verified value | How |
|---|---|---|
| Area API URL | `/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}[/{DATE}]` | firms.modaps.eosdis.nasa.gov/api/area/ |
| `DAY_RANGE` | **1–5 days** per request | same page |
| `DATE` | `YYYY-MM-DD`, **first day, inclusive**; window goes forward `DAY_RANGE` days | live test: `2026-11-10`, 2 days → acq_date 11-10 and 11-11 |
| Bounding box order | west,south,east,north | API page |
| Rate limit | **5000 transactions / 10 minutes** per MAP_KEY; large requests can count as several | API page; `/mapserver/mapkey_status/` returned `transaction_limit: 5000` |
| Area-API sources | LANDSAT_NRT, MODIS_NRT, MODIS_SP, VIIRS_NOAA20_NRT, VIIRS_NOAA20_SP, VIIRS_NOAA21_NRT, VIIRS_NOAA21_SP, VIIRS_SNPP_NRT, VIIRS_SNPP_SP | API page |
| Availability endpoint | `/api/data_availability/csv/{MAP_KEY}/ALL` → `data_id,min_date,max_date` | live call |
| Yearly country archive (SP) | `/data/country/{dir}/{YYYY}/{dir}_{YYYY}_{Country}.csv`, dirs `modis`, `viirs-snpp`, `viirs-jpss1` (= NOAA-20). **No NOAA-21 directory** (`viirs-jpss2`, `viirs-noaa21` → 404) | HTTP probes |
| Country archive years | modis 2003…2025 ✔, 2026 ✘; viirs-snpp 2012…2025 ✔; viirs-jpss1 2018…2025 ✔ | HTTP probes |

Availability on 2026-11-14 (live):

| data_id | min_date | max_date |
|---|---|---|
| MODIS_SP | 2000-11-01 | 2026-08-31 |
| MODIS_NRT | 2026-09-01 | 2026-11-14 |
| VIIRS_SNPP_SP | 2012-01-20 | 2026-07-31 |
| VIIRS_SNPP_NRT | 2026-08-01 | **2026-11-02** (Suomi NPP stopped delivering — not used) |
| VIIRS_NOAA20_SP | 2018-04-01 | 2026-07-31 |
| VIIRS_NOAA20_NRT | 2026-08-01 | 2026-11-14 |
| VIIRS_NOAA21_SP | 2023-03-01 | 2026-07-31 |
| VIIRS_NOAA21_NRT | 2024-01-17 | 2026-11-14 |

### What the pipeline pulls
| Period | Products | Channel |
|---|---|---|
| 2003-01-01 → 2025-12-31 | MODIS_SP (Terra+Aqua), VIIRS_SNPP_SP (2012-01-20+), VIIRS_NOAA20_SP (2018-04+) | yearly country archive (Brazil), clipped to region bbox |
| 2026-01-01 → SP max date | same three *_SP | area API, 5-day windows |
| SP max + 1 → today | MODIS_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT | area API, 5-day windows |

VIIRS_NOAA21_SP is available (2023-03+) but deliberately **not** used for history, so that the
VIIRS constellation stays at two satellites throughout most of the series (SNPP+NOAA-20); in
the NRT tail NOAA-20+NOAA-21 again gives two satellites. Before 2018-04 VIIRS is SNPP only.
See METHODOLOGY §Limitations.

### Raw field notes (observed in real files)
- MODIS columns: `latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite,
  instrument, confidence, version, bright_t31, frp, daynight, type`.
- VIIRS columns: same with `bright_ti4/bright_ti5` instead of `brightness/bright_t31`.
- `type` (0 vegetation fire, 1 active volcano, 2 other static land source, 3 offshore) is present
  in SP/archive files and **absent in NRT**.
- `acq_time` is HHMM UTC, zero-padded in archive files (`0130`), not padded in area API (`342`).
- `satellite`: MODIS `Terra`/`Aqua`; VIIRS `N` (SNPP), `N20`, `N21`.
- `confidence`: MODIS integer 0–100; VIIRS `l`/`n`/`h`.
- `version`: MODIS archive 2020 file shows `6.03`, area API MODIS_SP 2026 shows `61.03`; VIIRS SP `2`,
  NRT `2.0NRT`. Version is kept in the raw cache only.

## 2. Common detection schema (`raw_hotspots`)
| column | type | description |
|---|---|---|
| hotspot_id | int64 | deterministic hash of product, satellite, date, time, lat, lon |
| region | text | region key (config/regions.yaml) |
| date | date | acquisition date (UTC) |
| time_utc | int (HHMM) | acquisition time UTC |
| lat, lon | float | pixel centre, WGS84 |
| h3_cell | text (H3) | H3 cell at configured resolution (default 6) |
| sensor_family | MODIS \| VIIRS | |
| satellite | Terra \| Aqua \| SNPP \| NOAA20 \| NOAA21 | |
| frp | float (MW) | fire radiative power |
| brightness | float (K) | MODIS `brightness` (band 21/22) or VIIRS `bright_ti4` (I4) — not directly comparable |
| confidence_class | low \| nominal \| high | MODIS: <30 low, 30–79 nominal, ≥80 high (configurable); VIIRS l/n/h |
| daynight | D \| N | |
| source_product | text | FIRMS source (e.g. VIIRS_NOAA20_NRT) |

Quality filters: drop `low` confidence (configurable), drop `type` 1/2/3, drop NRT detections on
0.01° locations flagged static ≥3 times in SP data, drop exact duplicates.

## 3. `daily_cell_counts`
| column | description |
|---|---|
| region, h3_cell, date | key |
| modis_count / viirs_count | detections after cross-satellite footprint dedup (MODIS ~1 km, VIIRS ~375 m) |
| modis_fire / viirs_fire | cell had ≥1 detection of that family that day (fire-cell-day) |
| harmonized_count | VIIRS era: `viirs_fire` (0/1). MODIS-only era: `modis_fire × w_day`, w = calibrated regional FCD / MODIS FCD |
| frp_sum | sum of FRP of deduplicated detections |
| source_mix | MODIS \| VIIRS \| BOTH |

## 4. `monthly_region_stats`
| column | description |
|---|---|
| modis_cell_days, viirs_cell_days | raw fire-cell-days per family |
| harmonized_total | harmonized fire-cell-days (VIIRS-equivalent) |
| hotspot_count | quality-filtered detections (all satellites, before cross-satellite dedup) |
| obs_days, is_partial | observed days in the month; partial months (e.g. current) flagged |
| percentile | of the month's mean harmonized FCD/day vs the same calendar month in other complete years |
| anomaly_zscore | same reference, (x − mean) / sd |

## 5. `calibration_metrics`
Per method (`quantile_mapping`, `linear`, `raw_modis` = no calibration) and scope
(`loyo_daily`, `loyo_monthly`, `holdout=YYYY`, `month=MM`): bias (pred − obs), RMSE, R², overlap days.

## 6. Bundled sample
`data/sample/` is **synthetic** (see its README). Never report it as real activity.
