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

# Full-history per-cell aggregate (what the historical density map needs). Much smaller than
# daily_cell_counts, which the DB keeps only for the recent window (load.daily_cells_keep_days).
monthly_cell_counts = Table(
    "monthly_cell_counts", metadata,
    Column("region", String(64), primary_key=True),
    Column("year", SmallInteger, primary_key=True),
    Column("month", SmallInteger, primary_key=True),
    Column("h3_cell", String(16), primary_key=True),
    Column("modis_cell_days", SmallInteger, nullable=False),
    Column("viirs_cell_days", SmallInteger, nullable=False),
    Column("modis_count", Integer, nullable=False),
    Column("viirs_count", Integer, nullable=False),
    Column("harmonized_total", REAL, nullable=False),
    Column("frp_sum", REAL),
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

# ------------------------------------------------------------------ fire alerts (Telegram bot)
# Personal data (LGPD): only what the alert needs; deleted on /parar. RLS on, API-only access.
alert_recipients = Table(
    "alert_recipients", metadata,
    Column("id", String(32), primary_key=True),
    Column("kind", String(12), nullable=False),            # cidadao | bombeiro
    Column("full_name", String(120), nullable=False),
    Column("phone", String(32), nullable=False),
    Column("age", SmallInteger),                           # cidadão
    Column("address", Text),                               # cidadão (as typed)
    Column("unit", String(120)),                           # bombeiro: corporação / batalhão
    Column("city", String(80)),
    Column("state", String(80)),
    Column("country", String(2)),                          # ISO-3166 alpha-2
    Column("lat", Float, nullable=False),                  # cidadão: address; bombeiro: city centre
    Column("lon", Float, nullable=False),
    Column("radius_km", Float, nullable=False),
    Column("bbox_w", Float), Column("bbox_s", Float),      # bombeiro: municipality bounding box
    Column("bbox_e", Float), Column("bbox_n", Float),
    Column("link_token", String(40), nullable=False, unique=True),
    Column("telegram_chat_id", BigInteger),
    Column("guardian_consent", Boolean, nullable=False, default=False),
    Column("consent_at", DateTime(timezone=True), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("active", Boolean, nullable=False, default=True),
)

alert_log = Table(
    "alert_log", metadata,
    Column("recipient_id", String(32), primary_key=True),
    Column("fire_key", String(64), primary_key=True),      # rounded lat/lon + acquisition date/time
    Column("kind", String(12), nullable=False),            # alerta | teste
    Column("fire_lat", Float), Column("fire_lon", Float),
    Column("sent_at", DateTime(timezone=True), nullable=False),
)

TABLES = {t.name: t for t in metadata.sorted_tables}
