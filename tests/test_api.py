"""API endpoint tests on a temporary SQLite DB loaded from the bundled synthetic sample (offline)."""
import importlib
import warnings

import pandas as pd
import pytest

warnings.filterwarnings("ignore", category=DeprecationWarning)


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    tmp = tmp_path_factory.mktemp("api")
    mp.setenv("DB_BACKEND", "sqlite")
    mp.setenv("SQLITE_PATH", str(tmp / "api.db"))
    from etl.config import path
    from etl.extract.firms import read_sample
    from etl.config import get_region
    from etl.load import db
    importlib.reload(db)
    db._engine = None
    from etl.pipelines import run as pipeline
    region = get_region("sample_tocantins")
    od = path("processed") / region.key
    if not (od / "calibration_models.pkl").exists():
        pipeline.run_transform(read_sample(region).items(), region, synthetic=True)
    from etl.load.load import load_processed
    load_processed(od, region.key)
    from api import queries
    queries.clear_cache()
    from fastapi.testclient import TestClient
    from api.main import app
    yield TestClient(app)
    db.engine().dispose()
    db._engine = None
    queries.clear_cache()
    mp.undo()


R = "region=sample_tocantins"


def test_health_and_meta(client):
    assert client.get("/health").json()["status"] == "ok"
    m = client.get("/meta").json()
    assert any(r["key"] == "sample_tocantins" for r in m["regions"])
    assert "FIRMS" in m["attribution"]


def test_calendar_shape_and_top(client):
    r = client.get(f"/calendar?{R}&start=2015-01-01&end=2016-12-31&top_n=3")
    assert r.status_code == 200
    j = r.json()
    assert len(j["cells"]) == 24
    assert sum(c["is_top"] for c in j["cells"]) == 3
    top = max(j["cells"], key=lambda c: c["value"])
    assert top["is_top"] and top["month"] in (8, 9, 10)      # synthetic dry-season peak
    assert all(c["percentile"] is None or 0 <= c["percentile"] <= 100 for c in j["cells"])


def test_summary_sentence_in_portuguese(client):
    j = client.get(f"/summary?{R}").json()
    assert j["total_hotspots"] > 0
    assert j["current"]["category"] in {"muito_abaixo", "abaixo", "normal", "acima", "muito_acima", "indisponivel"}
    assert "células-dia" in j["current"]["sentence"] or "histórico" in j["current"]["sentence"]
    assert j["risk_next_7_days"]["available"] is False


def test_custom_area_changes_totals(client):
    whole = client.get(f"/summary?{R}&start=2015-01-01&end=2015-12-31").json()
    part = client.get(f"/summary?{R}&start=2015-01-01&end=2015-12-31&bbox=-48.5,-10.5,-47.5,-9.5").json()
    assert 0 < part["total_harmonized"] < whole["total_harmonized"]
    poly = client.get(f"/calendar?{R}&polygon=-48.5,-10.5;-47.5,-10.5;-47.5,-9.5;-48.5,-9.5").json()
    assert poly["area"] == "custom"


def test_hexgrid_monthly_and_daily(client):
    j = client.get(f"/hexgrid?{R}&start=2015-08-01&end=2015-09-30").json()
    assert j["granularity"] == "month" and len(j["cells"]) > 0
    c = j["cells"][0]
    assert len(c["boundary"]) == 6 and c["value"] == j["max_value"]
    d = client.get(f"/hexgrid?{R}&boundary=false").json()        # default: last 30 days -> daily table
    assert d["granularity"] == "day"
    assert all(x["boundary"] is None for x in d["cells"])


def test_harmonization_and_comparison(client):
    h = client.get(f"/harmonization?{R}").json()
    assert h["overlap_start"] and {m["method"] for m in h["metrics"]} >= {"quantile_mapping", "raw_modis"}
    assert any(p["overlap"] for p in h["series"]) and len(h["limitations"]) >= 3
    pre = [p for p in h["series"] if p["year"] < 2012]
    assert pre and all(p["viirs_raw"] is None and p["harmonized"] is not None for p in pre)
    c = client.get(f"/comparison?{R}&start=2020-01-01&end=2020-12-31").json()
    assert len(c["series"]) == 12


def test_recent_and_forecast_empty(client):
    j = client.get(f"/recent?{R}&days=5").json()
    assert len(j["days"]) == 5 and len(j["detections"]) > 0
    f = client.get(f"/forecast?{R}").json()
    assert f["available"] is False and "não certeza" in f["disclaimer"]


def test_export_csv_columns(client):
    r = client.get(f"/export.csv?{R}&start=2015-08-01&end=2015-08-31")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    lines = r.text.splitlines()
    assert lines[0].startswith("# Este projeto usa dados do NASA")
    assert lines[1] == ("date,region,cell_id,lat,lon,harmonized_count,modis_count,viirs_count,"
                        "source_mix,percentile,anomaly_zscore")
    assert len(lines) > 2
    f = client.get(f"/export.csv?{R}&kind=forecast").text.splitlines()[1]
    assert f.endswith("risk_probability,horizon_days")


def test_errors_are_actionable(client):
    assert client.get("/calendar?region=nope").status_code == 404
    assert client.get(f"/calendar?{R}&bbox=1,2").status_code == 422
    assert client.get(f"/calendar?{R}&start=2020-01-01&end=2019-01-01").status_code == 422
