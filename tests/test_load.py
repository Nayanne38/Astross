"""Load tests against a temporary SQLite database (same code path as Postgres except COPY)."""
import importlib

import numpy as np
import pandas as pd
import pytest


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "t.db"))
    from etl.load import db
    importlib.reload(db)
    db._engine = None
    db.create_schema()
    yield db
    db.engine().dispose()
    db._engine = None


def cells(days, n_cells=3):
    rows = [{"region": "r", "h3_cell": f"86a{i:012x}", "date": d, "modis_count": 1, "viirs_count": 2,
             "modis_fire": True, "viirs_fire": True, "harmonized_count": 1.0, "frp_sum": 5.0,
             "source_mix": "BOTH"} for d in days for i in range(n_cells)]
    return pd.DataFrame(rows)


def test_upsert_is_idempotent(fresh_db):
    db = fresh_db
    df = cells(pd.date_range("2024-08-01", periods=5))
    db.upsert("daily_cell_counts", df)
    db.upsert("daily_cell_counts", df)          # same rows again -> no duplicates
    assert db.table_counts("r", ["daily_cell_counts"])["daily_cell_counts"] == 15
    df2 = df.assign(harmonized_count=2.0)
    db.upsert("daily_cell_counts", df2)         # update in place
    v = db.read_sql("select distinct harmonized_count from daily_cell_counts")
    assert v.harmonized_count.tolist() == [2.0]


def test_replace_window_removes_vanished_cells(fresh_db):
    db = fresh_db
    db.upsert("daily_cell_counts", cells(pd.date_range("2024-08-01", periods=5), n_cells=3))
    # reprocessed last 2 days now have only 1 cell each
    new = cells(pd.date_range("2024-08-04", periods=2), n_cells=1)
    db.replace_where("daily_cell_counts", new, region="r",
                     date=(pd.Timestamp("2024-08-04").date(), pd.Timestamp("2024-08-05").date()))
    got = db.read_sql("select date, count(*) n from daily_cell_counts group by date order by date")
    assert got.n.tolist() == [3, 3, 3, 1, 1]


def test_longest_gap():
    from etl.load.checks import longest_false_run
    assert longest_false_run(np.array([True, False, False, True, False])) == 2
    assert longest_false_run(np.array([True, True])) == 0
