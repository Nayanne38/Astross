-- PostgreSQL / Supabase schema (mirror of etl/load/schema.py, which the loader uses to create
-- tables automatically). Run manually in the Supabase SQL editor if you prefer, or via
-- docker-compose for a local Postgres. PostGIS is optional: tables store lat/lon + H3.
-- CREATE EXTENSION IF NOT EXISTS postgis;   -- Supabase: Database -> Extensions -> postgis

CREATE TABLE IF NOT EXISTS raw_hotspots (          -- recent window only (load.raw_hotspots_keep_days)
    hotspot_id       BIGINT PRIMARY KEY,           -- 64-bit hash of product/satellite/date/time/lat/lon
    region           VARCHAR(64) NOT NULL,
    date             DATE NOT NULL,
    time_utc         SMALLINT NOT NULL,            -- HHMM UTC
    lat              DOUBLE PRECISION NOT NULL,
    lon              DOUBLE PRECISION NOT NULL,
    h3_cell          VARCHAR(16) NOT NULL,
    sensor_family    VARCHAR(5) NOT NULL,          -- MODIS | VIIRS
    satellite        VARCHAR(8) NOT NULL,          -- Terra | Aqua | SNPP | NOAA20 | NOAA21
    frp              DOUBLE PRECISION,
    brightness       DOUBLE PRECISION,
    confidence_class VARCHAR(8) NOT NULL,          -- low | nominal | high
    daynight         VARCHAR(1),
    source_product   VARCHAR(24) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_raw_region_date ON raw_hotspots (region, date);

CREATE TABLE IF NOT EXISTS daily_cell_counts (
    region           VARCHAR(64) NOT NULL,
    date             DATE NOT NULL,
    h3_cell          VARCHAR(16) NOT NULL,
    modis_count      SMALLINT NOT NULL,            -- MODIS detections after footprint dedup
    viirs_count      SMALLINT NOT NULL,            -- all VIIRS satellites after footprint dedup
    modis_fire       BOOLEAN NOT NULL,             -- MODIS fire-cell-day
    viirs_fire       BOOLEAN NOT NULL,             -- reference-satellite VIIRS fire-cell-day
    harmonized_count REAL NOT NULL,                -- VIIRS-equivalent fire-cell-day weight
    frp_sum          REAL,
    source_mix       VARCHAR(5) NOT NULL,          -- MODIS | VIIRS | BOTH
    PRIMARY KEY (region, date, h3_cell)
);

-- Full history per cell x month (the DB keeps daily_cell_counts only for load.daily_cells_keep_days)
CREATE TABLE IF NOT EXISTS monthly_cell_counts (
    region           VARCHAR(64) NOT NULL,
    year             SMALLINT NOT NULL,
    month            SMALLINT NOT NULL,
    h3_cell          VARCHAR(16) NOT NULL,
    modis_cell_days  SMALLINT NOT NULL,
    viirs_cell_days  SMALLINT NOT NULL,
    modis_count      INTEGER NOT NULL,
    viirs_count      INTEGER NOT NULL,
    harmonized_total REAL NOT NULL,
    frp_sum          REAL,
    PRIMARY KEY (region, year, month, h3_cell)
);

CREATE TABLE IF NOT EXISTS regional_daily (
    region            VARCHAR(64) NOT NULL,
    date              DATE NOT NULL,
    modis_fcd         INTEGER NOT NULL,
    viirs_fcd         INTEGER NOT NULL,
    modis_hotspots    INTEGER NOT NULL,
    viirs_hotspots    INTEGER NOT NULL,
    hotspots_total    INTEGER NOT NULL,
    modis_obs         BOOLEAN NOT NULL,
    viirs_obs         BOOLEAN NOT NULL,
    viirs_ref_sat     VARCHAR(8),
    modis_calibrated  DOUBLE PRECISION,
    harmonized        DOUBLE PRECISION,
    harmonized_source VARCHAR(10) NOT NULL,        -- VIIRS | MODIS_cal | none
    PRIMARY KEY (region, date)
);

CREATE TABLE IF NOT EXISTS monthly_region_stats (
    region                 VARCHAR(64) NOT NULL,
    year                   SMALLINT NOT NULL,
    month                  SMALLINT NOT NULL,
    modis_cell_days        INTEGER NOT NULL,
    viirs_cell_days        INTEGER NOT NULL,
    modis_calibrated_total DOUBLE PRECISION,
    harmonized_total       DOUBLE PRECISION NOT NULL,
    hotspot_count          INTEGER NOT NULL,
    obs_days               SMALLINT NOT NULL,
    days_in_month          SMALLINT NOT NULL,
    is_partial             BOOLEAN NOT NULL,
    daily_mean             DOUBLE PRECISION NOT NULL,
    percentile             DOUBLE PRECISION,       -- vs same calendar month, other complete years
    anomaly_zscore         DOUBLE PRECISION,
    PRIMARY KEY (region, year, month)
);

CREATE TABLE IF NOT EXISTS calibration_metrics (
    region       VARCHAR(64) NOT NULL,
    method       VARCHAR(24) NOT NULL,             -- quantile_mapping | linear | raw_modis
    scope        VARCHAR(32) NOT NULL,             -- loyo_daily | loyo_monthly | holdout=YYYY | month=MM | outside_window=YYYY
    bias         DOUBLE PRECISION,
    rmse         DOUBLE PRECISION,
    r2           DOUBLE PRECISION,
    overlap_days INTEGER,
    n_points     INTEGER,
    computed_at  TIMESTAMPTZ,
    PRIMARY KEY (region, method, scope)
);

CREATE TABLE IF NOT EXISTS risk_forecasts (
    region        VARCHAR(64) NOT NULL,
    h3_cell       VARCHAR(16) NOT NULL,
    forecast_date DATE NOT NULL,                   -- issue date
    horizon_days  SMALLINT NOT NULL,
    probability   DOUBLE PRECISION NOT NULL,
    risk_class    VARCHAR(16) NOT NULL,
    model_version VARCHAR(64) NOT NULL,
    PRIMARY KEY (region, h3_cell, forecast_date, horizon_days)
);

CREATE TABLE IF NOT EXISTS etl_runs (
    run_id      VARCHAR(40) PRIMARY KEY,
    region      VARCHAR(64) NOT NULL,
    mode        VARCHAR(16) NOT NULL,              -- full | incremental | sample
    status      VARCHAR(16) NOT NULL,              -- running | success | failed
    started_at  TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    row_counts  JSON,
    message     TEXT
);

-- Supabase: the public schema is exposed via the REST API (anon key). RLS with no policies blocks
-- that path; the ETL and FastAPI connect as the owner and are not affected.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['raw_hotspots','daily_cell_counts','monthly_cell_counts','regional_daily',
    'monthly_region_stats','calibration_metrics','risk_forecasts','etl_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP; END $$;
