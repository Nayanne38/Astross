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


def test_recent_area_filter_before_limit(client):
    full = client.get(f"/recent?{R}&days=60&limit=100000&learn=false").json()["detections"]
    assert full and "daynight" in full[0]
    # a small box around the OLDEST detection: with the limit applied before the area filter it would vanish
    o = full[-1]
    box = f"{o['lon']-0.05},{o['lat']-0.05},{o['lon']+0.05},{o['lat']+0.05}"
    j = client.get(f"/recent?{R}&days=60&limit=5&learn=false&bbox={box}").json()
    assert len(j["detections"]) > 0
    assert all(abs(d["lat"] - o["lat"]) < 0.2 and abs(d["lon"] - o["lon"]) < 0.2 for d in j["detections"])


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


# ------------------------------------------------------------------ educational layer
LEARN_URLS = [f"/calendar?{R}&start=2015-01-01&end=2016-12-31", f"/summary?{R}",
              f"/hexgrid?{R}&boundary=false", f"/comparison?{R}&start=2010-01-01&end=2016-12-31",
              f"/harmonization?{R}", f"/recent?{R}&days=5", f"/forecast?{R}"]


def test_every_view_has_learn_block(client):
    from api.education import violations
    ids = {t["id"] for t in client.get("/glossary").json()}
    for url in LEARN_URLS:
        j = client.get(url).json()
        L = j["learn"]
        assert L and L["cards"] and L["nao_diz"], url
        assert any(a["codigo"] == "sintetico" for a in L["avisos"]), url        # synthetic always labelled
        assert L["procedencia"]["is_synthetic"] is True and "FIRMS" in L["procedencia"]["fonte"]
        assert set(L["glossario"]) <= ids, url
        assert len(L["acessivel"]["alt_curto"]) <= 150
        texts = [c["texto"] for c in L["cards"]] + L["nao_diz"] + [a["texto"] for a in L["avisos"]]
        assert not [v for t in texts for v in violations(t)], url
        assert client.get(url + "&learn=false").json()["learn"] is None


def test_learn_levels_and_synthetic_on_custom_area(client):
    s = client.get(f"/summary?{R}&nivel=simples").json()["learn"]["cards"][0]["texto"]
    t = client.get(f"/summary?{R}&nivel=tecnico").json()["learn"]["cards"][0]["texto"]
    assert s != t and "percentil" not in s
    cur = client.get(f"/summary?{R}").json()["current"]
    assert set(cur["sentences"]) == {"simples", "estudante", "tecnico"} and cur["n_ref"] >= 3
    assert str(cur["n_ref"]) in cur["sentences"]["simples"]
    custom = client.get(f"/summary?{R}&bbox=-48.5,-10.5,-47.5,-9.5").json()["learn"]
    assert any(a["codigo"] == "sintetico" for a in custom["avisos"])
    assert client.get(f"/summary?{R}&nivel=xx").status_code == 422


def test_numbers_in_text_match_payload(client):
    h = client.get(f"/hexgrid?{R}&start=2015-08-01&end=2015-09-30&boundary=false").json()
    first = h["learn"]["cards"][0]
    assert first["id"] == "mapa.resumo" and str(h["n_cells"]) in first["texto"]
    assert h["n_cells"] >= len(h["cells"]) and h["total_value"] > 0
    r = client.get(f"/recent?{R}&days=5").json()
    assert str(len(r["detections"])) in r["learn"]["cards"][0]["texto"]


def test_unit_and_risk_wording(client):
    unit = client.get(f"/calendar?{R}").json()["unit"]
    assert "células-dia" in unit and "detecção de foco de calor" in unit and "com fogo" not in unit
    f = client.get(f"/forecast?{R}").json()
    assert [c["id"] for c in f["learn"]["cards"]] == ["prev.indisponivel"]


def test_glossary_paths_provenance(client):
    g = client.get("/glossary").json()
    assert len(g) >= 20 and all(t["armadilha"] for t in g)
    assert client.get("/glossary/area_queimada").json()["termo"] == "Área queimada"
    assert client.get("/glossary/nope").status_code == 404
    tec = client.get("/glossary/percentil?nivel=tecnico").json()
    assert tec["definicao"] == tec["tecnico"]
    p = client.get(f"/learn/paths?{R}").json()
    assert {x["id"] for x in p} >= {"t1", "t2", "t3", "t4"}
    assert client.get(f"/learn/paths/t1?{R}").json()["etapas"][0]["params"]["region"] == "sample_tocantins"
    pv = client.get(f"/provenance?{R}").json()
    assert pv["procedencia"]["is_synthetic"] and "sintética" in pv["resumo"]
    assert len(pv["limitacoes"]) == len(pv["limitacoes_simples"]) >= 8
    h = client.get(f"/harmonization?{R}").json()
    assert len(h["limitations_simple"]) == len(h["limitations"])


def test_month_comparison_and_deviation(client):
    j = client.get(f"/summary?{R}").json()
    c = j["comparison"]
    assert c["label"] and c["category"] in {"muito_abaixo", "abaixo", "normal", "acima", "muito_acima", "indisponivel"}
    if c["is_provisional"] or c["same_days_only"]:
        assert c["days_compared"] <= 31
    if c["percentile"] is not None:
        assert c["n_ref"] >= 3 and c["ref_year_max"] < c["year"]       # previous years only
        assert "%" in c["sentence"]
    cal = client.get(f"/calendar?{R}&start=2015-01-01&end=2015-12-31").json()
    assert all(x["deviation_pct"] is not None for x in cal["cells"])     # 2015 has >= 3 previous years


def test_forecast_climatology_fallback_is_labelled(client):
    f = client.get(f"/forecast?{R}").json()
    fb = f["fallback"]
    assert f["available"] is False and fb is not None
    assert "não é previsão" in fb["label"] and fb["thresholds_status"] == "a validar"
    assert fb["ref_year_min"] >= 2012 and fb["cells"]
    assert all(0 < x["frequency"] <= 1 for x in fb["cells"])
    assert client.get(f"/forecast?{R}&fallback=false").json()["fallback"] is None


def test_export_modis_only_flag(client):
    import io
    df = pd.read_csv(io.StringIO(client.get(f"/export.csv?{R}&start=2015-08-01&end=2015-08-31").text), comment="#")
    assert set(df.modis_only.unique()) <= {0, 1}
    assert ((df.modis_only == 1) == ((df.modis_count > 0) & (df.viirs_count == 0))).all()
