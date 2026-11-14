"""Database access: engine, schema creation and fast idempotent bulk writes.

Backends (DB_BACKEND in .env):
  sqlite    local file, no server (default; offline demo/tests)
  postgres  any Postgres, including Supabase (DATABASE_URL). Bulk writes use COPY into a temp
            table + INSERT ... ON CONFLICT DO UPDATE, so re-running a load is idempotent.
"""
from __future__ import annotations

import io
import logging
from typing import Iterable

import pandas as pd
from sqlalchemy import Engine, create_engine, delete, inspect, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from etl.config import database_url
from etl.load.schema import TABLES, metadata

log = logging.getLogger(__name__)
_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        url = database_url()
        kw = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kw["connect_args"] = {"timeout": 60}
        _engine = create_engine(url, **kw)
        log.info("database: %s", _engine.url.render_as_string(hide_password=True))
    return _engine


def is_postgres() -> bool:
    return engine().dialect.name == "postgresql"


def create_schema() -> None:
    eng = engine()
    metadata.create_all(eng)
    if eng.dialect.name == "sqlite":
        with eng.begin() as c:
            c.execute(text("PRAGMA journal_mode=WAL"))


def _date_cols(table: str) -> set[str]:
    """Columns declared as SQL DATE (not timestamps) — only these are truncated to a date."""
    from sqlalchemy import Date, DateTime
    return {c.name for c in TABLES[table].columns
            if isinstance(c.type, Date) and not isinstance(c.type, DateTime)}


def _records(df: pd.DataFrame, cols: list[str], date_cols: set[str]) -> list[dict]:
    d = df[cols].copy()
    for c in cols:
        if c in date_cols and pd.api.types.is_datetime64_any_dtype(d[c]):
            d[c] = d[c].dt.date
    d = d.astype(object).where(d.notna(), None)
    return d.to_dict("records")


def upsert(table: str, df: pd.DataFrame, chunk: int = 50_000) -> int:
    """Insert or update rows by primary key. Returns rows written."""
    if df.empty:
        return 0
    t = TABLES[table]
    cols = [c.name for c in t.columns if c.name in df.columns]
    pk = [c.name for c in t.primary_key.columns]
    if is_postgres():
        return _pg_copy_upsert(table, df[cols], pk)
    n = 0
    with engine().begin() as conn:
        for i in range(0, len(df), chunk):
            rows = _records(df.iloc[i:i + chunk], cols, _date_cols(table))
            stmt = sqlite_insert(t)
            upd = {c: stmt.excluded[c] for c in cols if c not in pk}
            conn.execute(stmt.on_conflict_do_update(index_elements=pk, set_=upd) if upd
                         else stmt.on_conflict_do_nothing(), rows)
            n += len(rows)
    return n


def _pg_copy_upsert(table: str, df: pd.DataFrame, pk: list[str]) -> int:
    cols = list(df.columns)
    buf = io.StringIO()
    out = df.copy()
    dcols = _date_cols(table)
    for c in cols:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].dt.strftime("%Y-%m-%d" if c in dcols else "%Y-%m-%dT%H:%M:%S%z")
        elif out[c].dtype == object and out[c].map(lambda v: isinstance(v, dict)).any():
            import json
            out[c] = out[c].map(lambda v: None if v is None else json.dumps(v))
        elif pd.api.types.is_bool_dtype(out[c]):
            out[c] = out[c].map({True: "t", False: "f"})
    out.to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    tmp = f"_stage_{table}"
    upd = [c for c in cols if c not in pk]
    collist = ", ".join(cols)
    conflict = (f"DO UPDATE SET " + ", ".join(f"{c}=EXCLUDED.{c}" for c in upd)) if upd else "DO NOTHING"
    raw = engine().raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(f"CREATE TEMP TABLE {tmp} (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP")
            with cur.copy(f"COPY {tmp} ({collist}) FROM STDIN WITH (FORMAT csv, NULL '\\N')") as cp:
                while chunk := buf.read(1 << 20):
                    cp.write(chunk)
            cur.execute(f"INSERT INTO {table} ({collist}) SELECT {collist} FROM {tmp} "
                        f"ON CONFLICT ({', '.join(pk)}) {conflict}")
        raw.commit()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()
    return len(df)


def replace_where(table: str, df: pd.DataFrame, **where) -> int:
    """Delete rows matching `where` (column=value or column=(lo, hi) date range), then upsert df.

    Used for windows that must be fully replaced (e.g. a re-processed day may have *fewer* cells).
    """
    t = TABLES[table]
    stmt = delete(t)
    for col, val in where.items():
        if isinstance(val, tuple):
            stmt = stmt.where(t.c[col] >= val[0], t.c[col] <= val[1])
        else:
            stmt = stmt.where(t.c[col] == val)
    with engine().begin() as conn:
        deleted = conn.execute(stmt).rowcount
    log.info("  %s: deleted %s rows for %s", table, deleted, where)
    return upsert(table, df)


def read_sql(sql: str, **params) -> pd.DataFrame:
    with engine().connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def table_counts(region: str, tables: Iterable[str]) -> dict[str, int]:
    names = set(inspect(engine()).get_table_names())
    out = {}
    with engine().connect() as conn:
        for t in tables:
            if t in names:
                out[t] = conn.execute(text(f"SELECT COUNT(*) FROM {t} WHERE region = :r"),
                                      {"r": region}).scalar_one()
    return out
