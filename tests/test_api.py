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
                        "source_mix,percentile,anomaly_zscore,modis_only")
    assert len(lines) > 2
    f = client.get(f"/export.csv?{R}&kind=forecast").text.splitlines()[1]
    assert f.endswith("risk_probability,horizon_days")


def test_errors_are_actionable(client):
    assert client.get("/calendar?region=nope").status_code == 404
    assert client.get(f"/calendar?{R}&bbox=1,2").status_code == 422
    assert client.get(f"/calendar?{R}&start=2020-01-01&end=2019-01-01").status_code == 422


def test_forecast_insight(client, monkeypatch):
    from datetime import date
    from etl.load import db
    from api import llm, queries
    import api.main as main
    import h3
    cells = list(h3.grid_disk(h3.latlng_to_cell(-10.0, -48.0, 6), 1))
    db.upsert("risk_forecasts", pd.DataFrame({
        "region": "sample_tocantins", "h3_cell": cells, "forecast_date": date(2026, 11, 13), "horizon_days": 7,
        "probability": [0.7, 0.4, 0.2, 0.1, 0.05, 0.03, 0.02], "risk_class":
        ["muito_alto", "alto", "moderado", "moderado", "baixo", "baixo", "baixo"], "model_version": "test"}))
    queries.clear_cache()
    main._INSIGHTS.clear()
    seen = {}

    def fake(context, audience, lang="en"):
        seen["ctx"], seen["aud"] = context, audience
        return llm.Insight(titulo="t", resumo="r", areas_prioritarias=[], fatores=[], confianca="media",
                           justificativa_confianca="j", limitacoes=[], recomendacoes=[])
    monkeypatch.setattr(llm, "generate_insight", fake)
    r = client.get(f"/forecast/insight?{R}&audience=professor")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["insight"]["confianca"] == "media" and j["audience"] == "professor"
    top = seen["ctx"]["previsao"]["celulas_maior_risco"][0]
    assert top["probabilidade"] == 0.7 and top["classe"] == "muito_alto"   # numbers come from the model
    assert client.get("/forecast").json() is not None

    def boom(*_):
        raise llm.InsightUnavailable("sem chave")
    monkeypatch.setattr(llm, "generate_insight", boom)
    main._INSIGHTS.clear()
    r = client.get(f"/forecast/insight?{R}")
    assert r.status_code == 503 and "sem chave" in r.json()["detail"]


def test_export_monthly(client):
    r = client.get(f"/export.csv?{R}&start=2010-01-01&end=2011-12-31&kind=monthly")
    assert r.status_code == 200
    lines = r.text.splitlines()
    assert lines[0].startswith("#") and "harmonizado_celulas_dia" in lines[1]
    assert len(lines) == 2 + 24


def test_firetrack_contract(client):
    s = client.get(f"/summary?{R}").json()
    c = s["comparison"]
    assert c["category"] in {"muito_abaixo", "abaixo", "normal", "acima", "muito_acima", "indisponivel"}
    assert "sentence" in c and c["n_ref"] >= 0
    cal = client.get(f"/calendar?{R}&top_n=3&nivel=simples").json()
    assert cal["learn"]["view"] == "calendario" and cal["learn"]["nivel"] == "simples"
    assert any(x["deviation_pct"] is not None for x in cal["cells"])
    assert client.get(f"/calendar?{R}&learn=false").json()["learn"] is None
    h = client.get(f"/hexgrid?{R}&limit=1&boundary=false").json()
    assert len(h["cells"]) == 1 and h["n_cells"] >= 1
    en = client.get(f"/harmonization?{R}&lang=en").json()
    assert en["learn"]["lang"] == "en" and en["limitations_simple"]
    f = client.get(f"/forecast?{R}&fallback=true").json()
    assert f["fallback"] is None or f["fallback"]["thresholds"] == [0.25, 0.5, 0.75]
    assert f["learn"]["view"] == "previsao"
    g = client.get("/glossary?nivel=tecnico&lang=en").json()
    assert any(t["id"] == "celula_dia" for t in g)
    r = client.get(f"/export.csv?{R}&kind=calendar")
    assert r.headers["x-row-count"].isdigit() and "deviation_pct" in r.text.splitlines()[1]
    r = client.get(f"/export.csv?{R}&start=2015-08-01&end=2015-08-31&category=coincidentes")
    assert r.status_code == 200


def test_live_regions(client, monkeypatch):
    """Global (live) tier: listed in /meta, served by /live from FIRMS NRT, refused by the history endpoints."""
    from datetime import datetime, timezone
    from alerts import firms_live
    from api import main

    meta = client.get("/meta").json()
    live = [r for r in meta["regions"] if r["live"]]
    assert len(live) >= 10 and all(r["group"] and r["data_start"] is None for r in live)
    assert any(not r["live"] for r in meta["regions"])

    now = datetime(2026, 11, 15, 14, 30, tzinfo=timezone.utc)
    fake = [firms_live.Fire(-17.0, -57.0, now, "NOAA-20 (VIIRS)", 12.5, "nominal", "D"),
            firms_live.Fire(-17.01, -57.01, now, "Terra (MODIS)", 40.0, "alta", "N")]
    monkeypatch.setattr(firms_live, "fetch", lambda bbox, days=1, client=None: fake)
    from etl import live_store
    monkeypatch.setattr(live_store, "is_fresh", lambda *a, **k: False)  # force the FIRMS path (offline, deterministic)
    main._LIVE_CACHE.clear()
    r = client.get("/live", params={"region": "brasil_pantanal", "days": 1})
    assert r.status_code == 200
    j = r.json()
    assert len(j["detections"]) == 2 and j["detections"][0]["frp"] == 40.0  # highest FRP first
    assert j["days"][0]["hotspots_total"] == 2 and j["days"][0]["harmonized"] is None
    assert client.get("/live", params={"region": "nope"}).status_code == 404
    assert client.get("/summary", params={"region": "brasil_pantanal"}).status_code == 409
