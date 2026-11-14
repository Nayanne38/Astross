"""MODIS -> VIIRS-equivalent calibration of daily regional fire-cell-day counts.

Unit: number of H3 cells with >=1 detection of a sensor family on a day (fire-cell-days, FCD).
On the overlap period (both families observing) we learn, per calendar month, a mapping
f_m: MODIS_FCD -> VIIRS_FCD, then:
  * regional harmonized series H_d = VIIRS_FCD_d where VIIRS observes, else f_m(MODIS_FCD_d);
  * cell level: VIIRS-era cell-days get viirs_fire (0/1); MODIS-only-era cell-days get
    modis_fire * w_d with w_d = f_m(M_d) / M_d, so cells sum to the calibrated regional value
    (except days with M_d = 0, where f_m(0) > 0 cannot be placed on any cell — reported).

Methods:
  quantile_mapping  empirical CDF matching with mid-rank ties (handles the many zero days),
                    ratio extrapolation beyond the training range.
  linear            OLS V = a + b*M per month (baseline, clipped at 0).
Validation: leave-one-year-out over every overlap year (whole years held out).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- mappers
@dataclass
class QuantileMap:
    x_tab: np.ndarray = field(default_factory=lambda: np.zeros(1))
    y_tab: np.ndarray = field(default_factory=lambda: np.zeros(1))
    tail_ratio: float = 1.0

    @classmethod
    def fit(cls, m: np.ndarray, v: np.ndarray) -> "QuantileMap":
        m, v = np.asarray(m, float), np.asarray(v, float)
        ms, n = np.sort(m), len(m)
        xs = np.unique(m)
        # mid-rank empirical CDF of MODIS at each observed value
        p = (np.searchsorted(ms, xs, "left") + 0.5 * (np.searchsorted(ms, xs, "right")
                                                       - np.searchsorted(ms, xs, "left"))) / n
        ys = np.quantile(v, p)
        hi_m, hi_v = np.quantile(m, 0.99), np.quantile(v, 0.99)
        ratio = hi_v / hi_m if hi_m > 0 else (v.mean() / max(m.mean(), 1e-9) if m.mean() > 0 else 1.0)
        return cls(xs, ys, float(ratio))

    def predict(self, m: np.ndarray) -> np.ndarray:
        m = np.asarray(m, float)
        y = np.interp(m, self.x_tab, self.y_tab)
        top_x, top_y = self.x_tab[-1], self.y_tab[-1]
        above = m > top_x
        y[above] = top_y + (m[above] - top_x) * self.tail_ratio
        return np.maximum(y, 0)


@dataclass
class LinearMap:
    a: float = 0.0
    b: float = 1.0

    @classmethod
    def fit(cls, m, v) -> "LinearMap":
        m, v = np.asarray(m, float), np.asarray(v, float)
        if np.var(m) == 0:
            return cls(float(v.mean()), 0.0)
        b, a = np.polyfit(m, v, 1)
        return cls(float(a), float(b))

    def predict(self, m) -> np.ndarray:
        return np.maximum(self.a + self.b * np.asarray(m, float), 0)


MAPPERS = {"quantile_mapping": QuantileMap, "linear": LinearMap}


def fit_monthly(df: pd.DataFrame, method: str) -> dict[int, object]:
    """df: overlap rows with columns date, modis_fcd, viirs_fcd."""
    months = pd.to_datetime(df["date"]).dt.month
    return {mo: MAPPERS[method].fit(g.modis_fcd, g.viirs_fcd) for mo, g in df.groupby(months)}


def predict_monthly(models: dict, df: pd.DataFrame) -> np.ndarray:
    months = pd.to_datetime(df["date"]).dt.month.to_numpy()
    out = np.full(len(df), np.nan)
    for mo, model in models.items():
        sel = months == mo
        out[sel] = model.predict(df.modis_fcd.to_numpy()[sel])
    return out


# ---------------------------------------------------------------- metrics
def metrics(pred: np.ndarray, obs: np.ndarray) -> dict:
    pred, obs = np.asarray(pred, float), np.asarray(obs, float)
    ok = ~(np.isnan(pred) | np.isnan(obs))
    pred, obs = pred[ok], obs[ok]
    if len(obs) == 0:
        return {"bias": None, "rmse": None, "r2": None, "n": 0}
    sst = ((obs - obs.mean()) ** 2).sum()
    return {"bias": float((pred - obs).mean()), "rmse": float(np.sqrt(((pred - obs) ** 2).mean())),
            "r2": float(1 - ((pred - obs) ** 2).sum() / sst) if sst > 0 else None, "n": int(len(obs))}


def validate_loyo(overlap: pd.DataFrame, methods=("quantile_mapping", "linear")) -> pd.DataFrame:
    """Leave-one-year-out validation. Returns one row per (method, scope)."""
    years = pd.to_datetime(overlap["date"]).dt.year
    preds = {m: np.full(len(overlap), np.nan) for m in methods}
    for y in sorted(years.unique()):
        train, test = overlap[years != y], years == y
        if len(train) < 60:
            continue
        for m in methods:
            preds[m][test.to_numpy()] = predict_monthly(fit_monthly(train, m), overlap[test])
    preds["raw_modis"] = overlap.modis_fcd.to_numpy(float)  # no calibration (reference)

    rows = []
    d = overlap.assign(_y=years, _mo=pd.to_datetime(overlap["date"]).dt.month)
    for m, p in preds.items():
        d["_p"] = p
        mon = d.groupby(["_y", "_mo"]).agg(p=("_p", "sum"), o=("viirs_fcd", "sum"))
        scopes = {"loyo_daily": (d._p, d.viirs_fcd), "loyo_monthly": (mon.p, mon.o)}
        scopes |= {f"holdout={y}": (g._p, g.viirs_fcd) for y, g in d.groupby("_y")}
        scopes |= {f"month={mo:02d}": (g._p, g.viirs_fcd) for mo, g in d.groupby("_mo")}
        for scope, (pp, oo) in scopes.items():
            r = metrics(pp.to_numpy(), oo.to_numpy())
            rows.append({"method": m, "scope": scope, "bias": r["bias"], "rmse": r["rmse"],
                         "r2": r["r2"], "overlap_days": r["n"] if scope != "loyo_monthly" else
                         int(len(d)), "n_points": r["n"]})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- apply
@dataclass
class HarmonizationResult:
    regional: pd.DataFrame          # date, modis_fcd, viirs_fcd, modis_calibrated, harmonized, ...
    cells: pd.DataFrame             # daily_cell_counts + harmonized_count
    metrics: pd.DataFrame           # validation table
    unplaced_fraction: float        # share of calibrated MODIS-era FCD that could not be put on cells


def coverage_days(spans) -> pd.DatetimeIndex:
    """Union of [first, last] day spans -> days observed by a family."""
    idx = pd.DatetimeIndex([])
    for a, b in spans:
        idx = idx.union(pd.date_range(a, b, freq="D"))
    return idx


def out_of_window_metrics(models_by_method: dict, rows: pd.DataFrame) -> pd.DataFrame:
    """Overlap years outside the calibration window, predicted with the window-fitted model."""
    out = []
    years = pd.to_datetime(rows["date"]).dt.year
    preds = {m: predict_monthly(mod, rows) for m, mod in models_by_method.items()}
    preds["raw_modis"] = rows.modis_fcd.to_numpy(float)
    for m, p in preds.items():
        for y in sorted(years.unique()):
            sel = (years == y).to_numpy()
            r = metrics(p[sel], rows.viirs_fcd.to_numpy()[sel])
            out.append({"method": m, "scope": f"outside_window={y}", "bias": r["bias"], "rmse": r["rmse"],
                        "r2": r["r2"], "overlap_days": r["n"], "n_points": r["n"]})
    return pd.DataFrame(out)


def harmonize(regional: pd.DataFrame, cells: pd.DataFrame, modis_days, viirs_days,
              method: str = "quantile_mapping", calibration_years: tuple | None = None) -> HarmonizationResult:
    """regional: output of aggregate.regional_daily; *_days: days each family was observing
    (from product coverage, so gaps between products are NOT treated as zero fire)."""
    r = regional.copy()
    r["modis_obs"] = r["date"].isin(modis_days)
    r["viirs_obs"] = r["date"].isin(viirs_days)
    overlap_all = r[r.modis_obs & r.viirs_obs].reset_index(drop=True)
    oy = pd.to_datetime(overlap_all["date"]).dt.year
    if calibration_years:
        in_win = (oy >= calibration_years[0]) & (oy <= calibration_years[1])
    else:
        in_win = pd.Series(True, index=overlap_all.index)
    overlap = overlap_all[in_win].reset_index(drop=True)
    outside = overlap_all[~in_win].reset_index(drop=True)
    if len(overlap) < 365:
        log.warning("only %d overlap days: calibration will be weak", len(overlap))
    if overlap.empty:
        raise SystemExit("No MODIS/VIIRS overlap days: cannot calibrate.")
    val = validate_loyo(overlap)
    models = fit_monthly(overlap, method)
    if len(outside):
        val = pd.concat([val, out_of_window_metrics(
            {m: fit_monthly(overlap, m) for m in MAPPERS}, outside)], ignore_index=True)
    r["modis_calibrated"] = np.where(r.modis_obs, predict_monthly(models, r), np.nan)
    r["harmonized"] = np.where(r.viirs_obs, r.viirs_fcd, r.modis_calibrated)
    r["harmonized_source"] = np.where(r.viirs_obs, "VIIRS", np.where(r.modis_obs, "MODIS_cal", "none"))

    # cell-level distribution of the calibrated MODIS-era totals
    w = np.where(r.modis_fcd > 0, r.modis_calibrated / r.modis_fcd.where(r.modis_fcd > 0, 1), 0.0)
    wmap = pd.Series(w, index=r["date"])
    vobs = pd.Series(r.viirs_obs.to_numpy(), index=r["date"])
    c = cells.copy()
    in_viirs = c["date"].map(vobs).fillna(False).astype(bool).to_numpy()
    c["harmonized_count"] = np.where(in_viirs, c.viirs_fire.astype(float),
                                     c.modis_fire.astype(float) * c["date"].map(wmap).fillna(0).to_numpy())
    modis_era = r[r.modis_obs & ~r.viirs_obs]
    total = modis_era.modis_calibrated.sum()
    unplaced = modis_era.loc[modis_era.modis_fcd == 0, "modis_calibrated"].sum()
    frac = float(unplaced / total) if total > 0 else 0.0
    log.info("harmonize: overlap=%d days, method=%s, unplaced MODIS-era mass=%.1f%%",
             len(overlap), method, 100 * frac)
    return HarmonizationResult(r, c, val, frac)


def monthly_stats(regional: pd.DataFrame) -> pd.DataFrame:
    """Per year-month totals + percentile and z-score vs the same calendar month in other years."""
    r = regional.copy()
    d = pd.to_datetime(r["date"])
    r["year"], r["month"] = d.dt.year, d.dt.month
    r["_obs"] = r["harmonized"].notna()
    if "hotspots_total" not in r:
        r["hotspots_total"] = r["modis_hotspots"] + r["viirs_hotspots"]
    m = r.groupby(["year", "month"]).agg(
        modis_cell_days=("modis_fcd", "sum"), viirs_cell_days=("viirs_fcd", "sum"),
        harmonized_total=("harmonized", "sum"), hotspot_count=("hotspots_total", "sum"),
        obs_days=("_obs", "sum"), days=("date", "size")).reset_index()
    m = m[m.obs_days > 0].reset_index(drop=True)          # months with no observation are dropped
    m["days_in_month"] = pd.to_datetime(dict(year=m.year, month=m.month, day=1)).dt.days_in_month
    m["is_partial"] = m.obs_days < m.days_in_month
    # Compare months by mean harmonized FCD per observed day, so partial months are comparable.
    m["daily_mean"] = m.harmonized_total / m.obs_days
    pct, z = [], []
    for _, row in m.iterrows():
        ref = m[(m.month == row.month) & (m.year != row.year) & ~m.is_partial].daily_mean
        if len(ref) < 3:
            pct.append(np.nan); z.append(np.nan); continue
        x = row.daily_mean
        pct.append(100 * ((ref < x).sum() + 0.5 * (ref == x).sum()) / len(ref))
        sd = ref.std(ddof=1)
        z.append((x - ref.mean()) / sd if sd > 0 else 0.0)
    m["percentile"], m["anomaly_zscore"] = pct, z
    return m
