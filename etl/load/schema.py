"""Portable table definitions (SQLAlchemy Core) for Postgres/Supabase and SQLite.

db/schema.sql is the hand-written Postgres equivalent (kept in sync; used for docs and
`docker compose`). The loader creates tables from this module, so either works.
"""
from __future__ import annotations

from sqlalchemy import (JSON, REAL, Boolean, Column, Date, DateTime, Float, Index, Integer, MetaData,
                        SmallInteger, BigInteger, String, Table, Text)

metadata = MetaData()

raw_hotspots = Table(
    "raw_hotspots", metadata,
    Column("hotspot_id", BigInteger, primary_key=True),
    Column("region", String(64), nullable=False),
    Column("date", Date, nullable=False),
    Column("time_utc", SmallInteger, nullable=False),
    Column("lat", Float, nullable=False),
    Column("lon", Float, nullable=False),
    Column("h3_cell", String(16), nullable=False),
    Column("sensor_family", String(5), nullable=False),
    Column("satellite", String(8), nullable=False),
    Column("frp", Float),
    Column("brightness", Float),
    Column("confidence_class", String(8), nullable=False),
    Column("daynight", String(1)),
    Column("source_product", String(24), nullable=False),
    Index("ix_raw_region_date", "region", "date"),
)

# Largest table (~3.5 M rows for Matopiba). Kept lean for Supabase's free tier: the primary key
# (region, date, h3_cell) is the only index and serves the API's region + date-range queries.
daily_cell_counts = Table(
    "daily_cell_counts", metadata,
    Column("region", String(64), primary_key=True),
    Column("date", Date, primary_key=True),
    Column("h3_cell", String(16), primary_key=True),
    Column("modis_count", SmallInteger, nullable=False),
    Column("viirs_count", SmallInteger, nullable=False),
    Column("modis_fire", Boolean, nullable=False),
    Column("viirs_fire", Boolean, nullable=False),
    Column("harmonized_count", REAL, nullable=False),
    Column("frp_sum", REAL),
    Column("source_mix", String(5), nullable=False),
)

regional_daily = Table(
    "regional_daily", metadata,
    Column("region", String(64), primary_key=True),
    Column("date", Date, primary_key=True),
    Column("modis_fcd", Integer, nullable=False),
    Column("viirs_fcd", Integer, nullable=False),
    Column("modis_hotspots", Integer, nullable=False),
    Column("viirs_hotspots", Integer, nullable=False),
    Column("hotspots_total", Integer, nullable=False),
    Column("modis_obs", Boolean, nullable=False),
    Column("viirs_obs", Boolean, nullable=False),
    Column("viirs_ref_sat", String(8)),
    Column("modis_calibrated", Float),
    Column("harmonized", Float),
    Column("harmonized_source", String(10), nullable=False),
)

monthly_region_stats = Table(
    "monthly_region_stats", metadata,
    Column("region", String(64), primary_key=True),
    Column("year", SmallInteger, primary_key=True),
    Column("month", SmallInteger, primary_key=True),
    Column("modis_cell_days", Integer, nullable=False),
    Column("viirs_cell_days", Integer, nullable=False),
    Column("modis_calibrated_total", Float),
    Column("harmonized_total", Float, nullable=False),
    Column("hotspot_count", Integer, nullable=False),
    Column("obs_days", SmallInteger, nullable=False),
    Column("days_in_month", SmallInteger, nullable=False),
    Column("is_partial", Boolean, nullable=False),
    Column("daily_mean", Float, nullable=False),
    Column("percentile", Float),
    Column("anomaly_zscore", Float),
)

calibration_metrics = Table(
    "calibration_metrics", metadata,
    Column("region", String(64), primary_key=True),
    Column("method", String(24), primary_key=True),
    Column("scope", String(32), primary_key=True),
    Column("bias", Float),
    Column("rmse", Float),
    Column("r2", Float),
    Column("overlap_days", Integer),
    Column("n_points", Integer),
    Column("computed_at", DateTime(timezone=True)),
)

risk_forecasts = Table(
    "risk_forecasts", metadata,
    Column("region", String(64), primary_key=True),
    Column("h3_cell", String(16), primary_key=True),
    Column("forecast_date", Date, primary_key=True),
    Column("horizon_days", SmallInteger, primary_key=True),
    Column("probability", Float, nullable=False),
    Column("risk_class", String(16), nullable=False),
    Column("model_version", String(64), nullable=False),
)

etl_runs = Table(
    "etl_runs", metadata,
    Column("run_id", String(40), primary_key=True),
    Column("region", String(64), nullable=False),
    Column("mode", String(16), nullable=False),
    Column("status", String(16), nullable=False),
    Column("started_at", DateTime(timezone=True), nullable=False),
    Column("finished_at", DateTime(timezone=True)),
    Column("row_counts", JSON),
    Column("message", Text),
)

TABLES = {t.name: t for t in metadata.sorted_tables}
