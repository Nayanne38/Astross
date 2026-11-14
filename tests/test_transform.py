import numpy as np
import pandas as pd
import pytest
import h3

from etl.transform import aggregate, harmonize, normalize, quality


def modis_raw(**kw):
    d = dict(latitude=[-10.0, -10.0005], longitude=[-48.0, -48.0005], brightness=[320.0, 330.0],
             scan=[1.0, 1.0], track=[1.0, 1.0], acq_date=["2020-08-01", "2020-08-01"],
             acq_time=["0130", "1640"], satellite=["Terra", "Aqua"], instrument="MODIS",
             confidence=[25, 85], version="6.1", bright_t31=290.0, frp=[10.0, 20.0],
             daynight=["N", "D"], type=[0, 0])
    d.update(kw)
    return pd.DataFrame(d)


def viirs_raw(**kw):
    d = dict(latitude=[-10.0, -9.5], longitude=[-48.0, -47.5], bright_ti4=[330.0, 340.0],
             scan=0.4, track=0.4, acq_date=["2020-08-01", "2020-08-02"], acq_time=[430, 1630],
             satellite=["N", "N20"], instrument="VIIRS", confidence=["n", "h"], version="2",
             bright_ti5=290.0, frp=[2.0, 3.0], daynight=["N", "D"])
    d.update(kw)
    return pd.DataFrame(d)


# ---------------------------------------------------------------- normalization
def test_modis_normalization():
    n = normalize.normalize(modis_raw(), "MODIS_SP")
    assert list(n.columns) == normalize.COLUMNS
    assert n.sensor_family.unique().tolist() == ["MODIS"]
    assert n.confidence_class.tolist() == ["low", "high"]      # 25 -> low, 85 -> high
    assert n.time_utc.tolist() == [130, 1640]                    # zero-padded string ok
    assert n.brightness.tolist() == [320.0, 330.0]


def test_viirs_normalization_without_type_column():
    n = normalize.normalize(viirs_raw(), "VIIRS_NOAA20_NRT")
    assert n.satellite.tolist() == ["SNPP", "NOAA20"]
    assert n.confidence_class.tolist() == ["nominal", "high"]
    assert n.fire_type.isna().all()                              # NRT has no `type`


def test_unknown_values_fail_loudly():
    with pytest.raises(ValueError, match="satellite"):
        normalize.normalize(viirs_raw(satellite=["XX", "N"]), "VIIRS_SNPP_SP")
    with pytest.raises(ValueError, match="confidence"):
        normalize.normalize(viirs_raw(confidence=["?", "n"]), "VIIRS_SNPP_SP")


def test_quality_filters_low_conf_and_static():
    df = normalize.normalize_all({"MODIS_SP": modis_raw(type=[0, 2]),
                                  "VIIRS_SNPP_SP": viirs_raw()})
    out, rep = quality.apply_filters(df)
    assert rep["input"] == 4
    assert (out.confidence_class != "low").all()
    assert not out.fire_type.isin([1, 2, 3]).any()


def test_static_mask_applies_to_nrt():
    sp = pd.DataFrame({"lat": [-10.001] * 3, "lon": [-48.001] * 3, "fire_type": [2, 2, 2]})
    mask = quality.static_mask(sp)
    nrt = normalize.normalize(viirs_raw(latitude=[-10.002, -9.5], longitude=[-48.002, -47.5]),
                              "VIIRS_NOAA21_NRT")
    out, _ = quality.apply_filters(nrt, mask)
    assert len(out) == 1 and out.lat.iloc[0] == -9.5


# ---------------------------------------------------------------- h3 / dedup
def test_h3_aggregation_and_cross_satellite_dedup():
    df = normalize.normalize_all({"MODIS_SP": modis_raw(confidence=[50, 85]),
                                  "VIIRS_SNPP_SP": viirs_raw()})
    df = aggregate.add_h3(df, 6)
    names = aggregate.cell_str(df.h3_cell)
    assert all(h3.get_resolution(c) == 6 for c in names)
    assert names[0] == h3.latlng_to_cell(-10.0, -48.0, 6)
    dd = aggregate.dedup_cross_satellite(df)
    # Terra + Aqua 50 m apart, same day -> one MODIS detection
    assert (dd.sensor_family == "MODIS").sum() == 1
    cells = aggregate.daily_cell_counts(dd)
    row = cells[cells.date == pd.Timestamp("2020-08-01")].iloc[0]
    assert row.modis_count == 1 and row.viirs_count == 1 and row.source_mix == "BOTH"


# ---------------------------------------------------------------- harmonization
def synthetic_pair(n_years=8, factor=2.5, seed=0):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2012-01-01", periods=365 * n_years, freq="D")
    season = 1 + 20 * np.exp(-((dates.day_of_year - 245) / 30) ** 2)
    m = rng.poisson(season)
    v = np.round(factor * m).astype(int)   # known deterministic offset: VIIRS = 2.5 x MODIS
    return pd.DataFrame({"date": dates, "modis_fcd": m, "viirs_fcd": v})


@pytest.mark.parametrize("method", ["quantile_mapping", "linear"])
def test_calibration_recovers_known_offset(method):
    d = synthetic_pair()
    val = harmonize.validate_loyo(d, methods=(method,))
    loyo = val[(val.method == method) & (val.scope == "loyo_monthly")].iloc[0]
    raw = val[(val.method == "raw_modis") & (val.scope == "loyo_monthly")].iloc[0]
    monthly_mean_v = d.assign(m=pd.to_datetime(d.date).dt.to_period("M")).groupby("m").viirs_fcd.sum().mean()
    assert abs(loyo.bias) < 0.02 * monthly_mean_v
    assert loyo.r2 > 0.99
    assert abs(raw.bias) > 0.5 * monthly_mean_v                 # uncalibrated is badly biased
    models = harmonize.fit_monthly(d, method)
    pred = harmonize.predict_monthly(models, pd.DataFrame({"date": [pd.Timestamp("2030-09-01")],
                                                           "modis_fcd": [10]}))
    assert pred[0] == pytest.approx(25, rel=0.05)


def test_quantile_map_extrapolates_beyond_training_range():
    qm = harmonize.QuantileMap.fit(np.arange(0, 50), 3 * np.arange(0, 50))
    assert qm.predict(np.array([100.0]))[0] == pytest.approx(300, rel=0.05)


def test_harmonize_respects_coverage_gaps():
    d = synthetic_pair(n_years=3)
    d["modis_hotspots"], d["viirs_hotspots"] = d.modis_fcd, d.viirs_fcd
    dates = pd.to_datetime(d.date)
    modis_days = pd.DatetimeIndex(d.date)
    viirs_days = pd.DatetimeIndex(d.date[(dates >= "2013-01-01") & (dates < "2014-01-01")])
    cells = pd.DataFrame(columns=["h3_cell", "date", "modis_fire", "viirs_fire", "modis_count",
                                  "viirs_count"])
    res = harmonize.harmonize(d, cells, modis_days, viirs_days)
    r = res.regional
    assert (r.loc[r.viirs_obs, "harmonized"] == r.loc[r.viirs_obs, "viirs_fcd"]).all()
    assert r.loc[~r.viirs_obs, "harmonized_source"].eq("MODIS_cal").all()
    m = harmonize.monthly_stats(r)
    assert len(m) == 36 and m.is_partial.sum() == 1   # 3x365 days from 2012 (leap) ends 2014-12-30


def test_viirs_reference_single_satellite_per_day():
    spans = pd.DataFrame({"satellite": ["SNPP", "NOAA20", "NOAA21"],
                          "min": pd.to_datetime(["2012-01-20", "2018-04-01", "2026-08-01"]),
                          "max": pd.to_datetime(["2026-07-31", "2026-11-14", "2026-11-14"])})
    ref = aggregate.viirs_reference_days(spans, ["SNPP", "NOAA20", "NOAA21"])
    assert ref[pd.Timestamp("2020-06-01")] == "SNPP"          # SNPP preferred while available
    assert ref[pd.Timestamp("2026-09-01")] == "NOAA20"        # then NOAA-20, never NOAA-21
    assert ref.index.is_unique and set(ref.unique()) == {"SNPP", "NOAA20"}
    # reference flag is computed before dedup: a SNPP pixel is kept even if NOAA-20 has higher FRP
    det = normalize.normalize(viirs_raw(latitude=[-10.0, -10.0001], longitude=[-48.0, -48.0001],
                                        satellite=["N", "N20"], frp=[1.0, 50.0],
                                        acq_date=["2020-08-01"] * 2), "VIIRS_SNPP_SP")
    det = aggregate.mark_viirs_reference(aggregate.add_h3(det, 6), ref)
    cells = aggregate.daily_cell_counts(aggregate.dedup_cross_satellite(det), ref_det=det[det.viirs_ref])
    assert cells.viirs_fire.all() and cells.viirs_count.iloc[0] == 1
