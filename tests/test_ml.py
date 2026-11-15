"""Risk-model tests on a small synthetic panel (offline, no database)."""
import numpy as np
import pandas as pd
import h3

from ml.features import FEATURES, build_dataset, build_panel, latest_features
from ml.forecast import risk_class
from ml.train import blocks_window, baselines, fit, scores, tune


def _frames(n_days=200, seed=0):
    rng = np.random.default_rng(seed)
    centre = h3.latlng_to_cell(-10.0, -48.0, 6)
    cells = sorted(h3.grid_disk(centre, 3))
    days = pd.date_range("2025-01-01", periods=n_days, freq="D")
    hot = set(cells[:10])                                  # persistent hotspots
    rows = []
    for d in days:
        season = 0.25 if d.month in (7, 8, 9) else 0.03
        for c in cells:
            p = season * (4 if c in hot else 1)
            if rng.random() < p:
                rows.append({"date": d.date(), "h3_cell": c, "modis_fire": True, "viirs_fire": True,
                             "frp_sum": float(rng.gamma(2, 10))})
    daily = pd.DataFrame(rows)
    monthly = pd.DataFrame([{"year": y, "month": m, "h3_cell": c, "modis_cell_days": int(c in hot) * 3,
                             "viirs_cell_days": int(c in hot) * 4, "harmonized_total": float(c in hot) * 4}
                            for y in (2020, 2021, 2022) for m in range(1, 13) for c in cells])
    reg = daily.groupby("date").size().rename("harmonized").reset_index()
    return {"daily": daily, "monthly": monthly, "regional": reg}


def test_panel_and_dataset_no_leakage():
    p = build_panel(_frames())
    df = build_dataset(p, horizon=7, step=7)
    assert set(FEATURES) <= set(df.columns)
    assert df.target.isin([0, 1]).all()
    # the target of the first origin must equal fire in days t+1..t+7 recomputed by hand
    t0 = df.origin.min()
    t = p.days.get_loc(t0)
    expect = p.fire[:, t + 1:t + 8].any(axis=1).astype(int)
    got = df[df.origin == t0].target.to_numpy()
    assert (got == expect).all()
    # fd7 counts only days <= origin
    assert (df[df.origin == t0].fd7.to_numpy() == p.fire[:, t - 6:t + 1].sum(axis=1)).all()


def test_split_is_temporal_and_model_beats_persistence():
    p = build_panel(_frames(n_days=1000))     # ~2.7 years: training covers a full dry season
    b = blocks_window(p, horizon=7, test_days=60, valid_days=40)
    sets = {k: build_dataset(p, 7, 3, start=s, end=e) for k, (s, e) in b.items()}
    train, valid, test = sets["train"], sets["valid"], sets["test"]
    assert train.origin.max() + pd.Timedelta(days=7) < valid.origin.min()
    assert valid.origin.max() + pd.Timedelta(days=7) < test.origin.min()
    params, rounds, trials = tune(train, valid, grid={"num_leaves": [7, 15], "min_child_samples": [5, 20]})
    assert len(trials) == 4 and rounds >= 1
    m = fit(train, params, rounds)
    s_model = scores(test.target, m.predict(test[FEATURES]))
    s_pers = scores(test.target, baselines(test)["persistence"])
    assert s_model["roc_auc"] is not None and s_model["roc_auc"] >= s_pers["roc_auc"] - 0.05


def test_latest_features_and_classes():
    p = build_panel(_frames())
    f = latest_features(p)
    assert len(f) == len(p.cells) and f.origin.iloc[0] == p.days[-1]
    assert list(risk_class(np.array([0.05, 0.2, 0.45, 0.9]))) == ["baixo", "moderado", "alto", "muito_alto"]


def test_negative_downsampling_keeps_weighted_rate():
    p = build_panel(_frames(n_days=200))
    full = build_dataset(p, 7, 7)
    sub = build_dataset(p, 7, 7, neg_frac=0.3)
    assert sub.target.sum() == full.target.sum() and len(sub) < len(full)
    assert abs(np.average(sub.target, weights=sub.weight) - full.target.mean()) < 0.02


def test_no_lookahead_in_climatology():
    from ml.features import climatology
    fr = _frames()
    m = fr["monthly"].copy()
    m.loc[m.year == 2022, "harmonized_total"] = 0
    m.loc[m.year == 2022, ["modis_cell_days", "viirs_cell_days"]] = 0
    c21 = climatology(m, before_year=2022)
    c23 = climatology(m, before_year=2023)
    assert (c21.frac_years >= c23.frac_years - 1e-9).all()   # 2022 only counts for origins in 2023+
