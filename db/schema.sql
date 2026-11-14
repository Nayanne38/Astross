-- PostgreSQL + PostGIS schema. The SQLite fallback creates equivalent tables
-- (without geometry columns) from the SQLAlchemy models in etl/load/.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS raw_hotspots (
    hotspot_id       TEXT PRIMARY KEY,          -- deterministic hash of source fields
    region           TEXT NOT NULL,
    date             DATE NOT NULL,
    time_utc         SMALLINT NOT NULL,         -- HHMM
    lat              DOUBLE PRECISION NOT NULL,
    lon              DOUBLE PRECISION NOT NULL,
    geom             GEOMETRY(Point, 4326),
    h3_cell          TEXT NOT NULL,
    sensor_family    TEXT NOT NULL CHECK (sensor_family IN ('MODIS','VIIRS')),
    satellite        TEXT NOT NULL,
    frp              DOUBLE PRECISION,
    brightness       DOUBLE PRECISION,
    confidence_class TEXT NOT NULL CHECK (confidence_class IN ('low','nominal','high')),
    daynight         CHAR(1),
    source_product   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_raw_region_date ON raw_hotspots (region, date);
CREATE INDEX IF NOT EXISTS ix_raw_h3 ON raw_hotspots (h3_cell);
CREATE INDEX IF NOT EXISTS ix_raw_geom ON raw_hotspots USING GIST (geom);

CREATE TABLE IF NOT EXISTS daily_cell_counts (
    region           TEXT NOT NULL,
    h3_cell          TEXT NOT NULL,
    date             DATE NOT NULL,
    modis_count      INTEGER NOT NULL DEFAULT 0,   -- deduplicated MODIS detections
    viirs_count      INTEGER NOT NULL DEFAULT 0,   -- deduplicated VIIRS detections
    modis_fire       BOOLEAN NOT NULL DEFAULT FALSE,
    viirs_fire       BOOLEAN NOT NULL DEFAULT FALSE,
    harmonized_count DOUBLE PRECISION NOT NULL,   -- VIIRS-equivalent fire-cell-day weight
    frp_sum          DOUBLE PRECISION,
    source_mix       TEXT NOT NULL,               -- MODIS | VIIRS | BOTH
    PRIMARY KEY (region, h3_cell, date)
);
CREATE INDEX IF NOT EXISTS ix_dcc_region_date ON daily_cell_counts (region, date);
CREATE INDEX IF NOT EXISTS ix_dcc_cell ON daily_cell_counts (h3_cell);

CREATE TABLE IF NOT EXISTS monthly_region_stats (
    region            TEXT NOT NULL,
    year              SMALLINT NOT NULL,
    month             SMALLINT NOT NULL,
    modis_cell_days   INTEGER NOT NULL,
    viirs_cell_days   INTEGER NOT NULL,
    harmonized_total  DOUBLE PRECISION NOT NULL,
    hotspot_count     INTEGER NOT NULL,
    percentile        DOUBLE PRECISION,           -- vs same calendar month, all years
    anomaly_zscore    DOUBLE PRECISION,
    PRIMARY KEY (region, year, month)
);

CREATE TABLE IF NOT EXISTS calibration_metrics (
    region        TEXT NOT NULL,
    method        TEXT NOT NULL,
    scope         TEXT NOT NULL,                  -- 'overall' | 'month=MM' | 'holdout=YYYY'
    bias          DOUBLE PRECISION,
    rmse          DOUBLE PRECISION,
    r2            DOUBLE PRECISION,
    overlap_days  INTEGER,
    computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (region, method, scope)
);

CREATE TABLE IF NOT EXISTS risk_forecasts (
    region        TEXT NOT NULL,
    h3_cell       TEXT NOT NULL,
    forecast_date DATE NOT NULL,                  -- issue date
    horizon_days  SMALLINT NOT NULL,
    probability   DOUBLE PRECISION NOT NULL,
    risk_class    TEXT NOT NULL,
    model_version TEXT NOT NULL,
    PRIMARY KEY (region, h3_cell, forecast_date, horizon_days)
);

CREATE TABLE IF NOT EXISTS etl_runs (
    run_id       TEXT PRIMARY KEY,
    region       TEXT NOT NULL,
    mode         TEXT NOT NULL,                   -- full | incremental | demo
    status       TEXT NOT NULL,                   -- running | success | failed
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ,
    row_counts   JSONB,
    message      TEXT
);
