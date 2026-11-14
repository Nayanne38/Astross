from etl.config import get_region, regions, settings


def test_regions_load():
    assert "matopiba" in regions()
    r = get_region("matopiba")
    w, s, e, n = r.bbox
    assert w < e and s < n
    assert r.bbox_str.count(",") == 3


def test_settings_nrt_excludes_snpp():
    # Suomi NPP stopped delivering NRT data on 2026-11-02.
    assert not any("SNPP" in s for s in settings()["extract"]["nrt_sources"])
