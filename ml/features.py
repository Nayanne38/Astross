"""Feature engineering for the 7-day fire-risk model.

Unit: one H3 cell (res 6) at one forecast origin day t. Everything is computed from data up to and
including t; the target looks at the next `horizon` days (t+1 .. t+horizon).

Daily sources (`load_frames(source=...)`):
  "parquet"  data/processed/<region>/daily_cell_counts.parquet — full daily history (ETL output);
             used for multi-year training.
  "db"       daily_cell_counts table — recent window only (365 days on Supabase); used to forecast.
Always from the database: monthly_cell_counts (per-cell history since 2003 -> climatology).

The daily table is sparse (only cell-days with fire), so we build a dense cell x day matrix and use
cumulative sums: every window count is O(1) per (cell, origin). Matrices use compact dtypes so a
10-year panel of ~33k cells fits in a few GB.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import h3
import numpy as np
import pandas as pd

from etl.config import path
from etl.load import db
from etl.transform.aggregate import cell_str

FEATURES = [
    "fd7", "fd14", "fd30", "fd60", "fd365", "frp30_log", "days_since_fire",
    "nbr_fd7", "nbr_fd30",
    "ly_fd7", "ly_nbr_fd7",
    "clim_frac", "clim_mean", "clim_frac_next",
    "reg_fd7_log", "reg_trend", "reg_ly_fd7_log",
    "month_sin", "month_cos",
]
SHORT_LOOKBACK = 60     # minimum history for the recency features
LONG_LOOKBACK = 372     # history needed for the "same week last year" and 365-day features


@dataclass
class Panel:
    """Dense daily panel for one region."""
    cells: np.ndarray          # (C,) H3 ids
    days: pd.DatetimeIndex     # (D,)
    fire: np.ndarray           # (C, D) bool, fire-cell-day flag (any sensor family)
    frp: np.ndarray            # (C, D) float32, FRP sum
    neighbors: np.ndarray      # (C, 6) int index into cells, -1 = outside the universe
    monthly: pd.DataFrame      # per-cell monthly history (for climatology by year)
    regional: np.ndarray       # (D,) regional fire-cell-days per day
    _clim: dict = field(default_factory=dict, repr=False)

    def clim(self, before_year: int, month: int, col: str) -> np.ndarray:
        """Per-cell climatology for `month` using only years < before_year (cached)."""
        key = (before_year, month, col)
        if key not in self._clim:
            c = climatology(self.monthly, before_year)
            for m in range(1, 13):
                for k in ("frac_years", "mean_cd"):
                    s = c.xs(m, level="month")[k] if (not c.empty and m in c.index.get_level_values("month")) else pd.Series(dtype=float)
                    self._clim[(before_year, m, k)] = s.reindex(self.cells).fillna(0.0).to_numpy(np.float32)
        return self._clim[key]


# ------------------------------------------------------------------ loading
def load_frames(region: str, source: str = "db", start: str | None = None) -> dict[str, pd.DataFrame]:
    monthly = db.read_sql(
        "SELECT year, month, h3_cell, modis_cell_days, viirs_cell_days, harmonized_total "
        "FROM monthly_cell_counts WHERE region = :r", r=region)
    if source == "parquet":
        d = Path(path("processed")) / region
        f = d / "daily_cell_counts.parquet"
        if not f.exists():
            raise SystemExit(f"{f} not found. Run: python -m etl.pipelines.run --mode full --steps extract,transform")
        daily = pd.read_parquet(f, columns=["date", "h3_cell", "modis_fire", "viirs_fire", "frp_sum"])
        if not pd.api.types.is_object_dtype(daily.h3_cell):      # parquet stores uint64 H3 ids
            daily["h3_cell"] = cell_str(daily.h3_cell.to_numpy())
        reg = pd.read_parquet(d / "regional_daily.parquet", columns=["date", "harmonized"])
        if start:
            daily = daily[pd.to_datetime(daily["date"]) >= pd.Timestamp(start)]
            reg = reg[pd.to_datetime(reg["date"]) >= pd.Timestamp(start) - pd.Timedelta(days=LONG_LOOKBACK)]
    else:
        daily = db.read_sql(
            "SELECT date, h3_cell, modis_fire, viirs_fire, frp_sum FROM daily_cell_counts WHERE region = :r",
            r=region)
        reg = db.read_sql("SELECT date, harmonized FROM regional_daily WHERE region = :r", r=region)
    return {"daily": daily, "monthly": monthly, "regional": reg}


def climatology(monthly: pd.DataFrame, before_year: int) -> pd.DataFrame:
    """Per (cell, month): fraction of past years with fire in that month and mean fire-cell-days.

    Only years < before_year are used, so the climatology never sees the forecast year (no leakage).
    """
    m = monthly[monthly.year < before_year]
    if m.empty:
        return pd.DataFrame(columns=["frac_years", "mean_cd"])
    n_years = m.year.nunique()
    cd = np.maximum(m.modis_cell_days.to_numpy(), m.viirs_cell_days.to_numpy())
    m = m.assign(cd=cd, fire=(cd > 0) | (m.harmonized_total.to_numpy() > 0))
    g = m.groupby(["h3_cell", "month"]).agg(n_fire=("fire", "sum"), sum_cd=("cd", "sum"))
    return pd.DataFrame({"frac_years": g.n_fire / n_years, "mean_cd": g.sum_cd / n_years})


def build_panel(frames: dict[str, pd.DataFrame]) -> Panel:
    daily, monthly, reg = frames["daily"], frames["monthly"], frames["regional"]
    if daily.empty:
        raise ValueError("daily_cell_counts is empty for this region — run the ETL first")
    daily = daily.assign(date=pd.to_datetime(daily["date"]))
    days = pd.date_range(daily.date.min(), daily.date.max(), freq="D")
    cells = np.array(sorted(set(daily.h3_cell) | set(monthly.h3_cell)))
    ci = pd.Series(np.arange(len(cells)), index=cells)
    di = pd.Series(np.arange(len(days)), index=days)

    fire = np.zeros((len(cells), len(days)), dtype=bool)
    frp = np.zeros((len(cells), len(days)), dtype=np.float32)
    flag = daily.modis_fire.astype(bool) | daily.viirs_fire.astype(bool)
    r, c = ci[daily.h3_cell].to_numpy(), di[daily.date].to_numpy()
    fire[r, c] = flag.to_numpy()
    frp[r, c] = daily.frp_sum.fillna(0).to_numpy(dtype=np.float32)

    nb = np.full((len(cells), 6), -1, dtype=np.int64)
    lookup = ci.to_dict()
    for i, cell in enumerate(cells):
        ring = list(h3.grid_ring(cell, 1))[:6]
        nb[i, :len(ring)] = [lookup.get(x, -1) for x in ring]

    reg = reg.assign(date=pd.to_datetime(reg["date"])).set_index("date").harmonized
    regional = reg.reindex(days).fillna(0.0).to_numpy(np.float32)
    return Panel(cells, days, fire, frp, nb, monthly, regional)


# ------------------------------------------------------------------ features
@dataclass
class Cumulative:
    fire: np.ndarray       # (C, D+1) cumulative fire days, leading zero column
    frp: np.ndarray        # (C, D+1) cumulative FRP
    last_fire: np.ndarray  # (C, D) index of last fire day <= t, or -1
    reg: np.ndarray        # (D+1,) cumulative regional fire-cell-days


def cumulative(p: Panel) -> Cumulative:
    C, D = p.fire.shape
    cdt = np.int16 if D < 32000 else np.int32
    cs_fire = np.zeros((C, D + 1), dtype=cdt)
    np.cumsum(p.fire, axis=1, dtype=cdt, out=cs_fire[:, 1:])
    cs_frp = np.zeros((C, D + 1), dtype=np.float32)
    np.cumsum(p.frp, axis=1, dtype=np.float32, out=cs_frp[:, 1:])
    last = np.full((C, D), -1, dtype=cdt)
    cur = np.full(C, -1, dtype=cdt)
    for t in range(D):                      # running "last fire" index (avoids a (C, D) int64 temp)
        cur = np.where(p.fire[:, t], t, cur).astype(cdt)
        last[:, t] = cur
    reg = np.concatenate([[0.0], np.cumsum(p.regional, dtype=np.float64)])
    return Cumulative(cs_fire, cs_frp, last, reg)


def _w(cs: np.ndarray, a: int, b: int) -> np.ndarray:
    """Sum over day indices [a, b] (inclusive, clipped) from a cumulative matrix with leading zero."""
    D = cs.shape[-1] - 1
    a, b = max(a, 0), min(b, D - 1)
    if b < a:
        return np.zeros(cs.shape[0], dtype=np.float32) if cs.ndim == 2 else 0.0
    return (cs[..., b + 1] - cs[..., a]).astype(np.float32)


def features_at(p: Panel, t: int, cu: Cumulative) -> pd.DataFrame:
    """Feature table for every cell at origin index t (all info <= day t)."""
    day = p.days[t]
    fd7, fd30 = _w(cu.fire, t - 6, t), _w(cu.fire, t - 29, t)
    out = {
        "fd7": fd7, "fd14": _w(cu.fire, t - 13, t), "fd30": fd30, "fd60": _w(cu.fire, t - 59, t),
        "fd365": _w(cu.fire, t - 364, t),
        "frp30_log": np.log1p(np.maximum(_w(cu.frp, t - 29, t), 0)),
    }
    lf = cu.last_fire[:, t].astype(np.int32)
    out["days_since_fire"] = np.where(lf >= 0, t - lf, 999).astype(np.float32)
    valid = p.neighbors >= 0
    idx = np.where(valid, p.neighbors, 0)
    out["nbr_fd7"] = np.where(valid, fd7[idx], 0).sum(axis=1)
    out["nbr_fd30"] = np.where(valid, fd30[idx], 0).sum(axis=1)
    # the horizon window one year earlier (t-365+1 .. t-365+7): known at t, captures seasonality
    ly = _w(cu.fire, t - 364, t - 358)
    out["ly_fd7"] = ly
    out["ly_nbr_fd7"] = np.where(valid, ly[idx], 0).sum(axis=1)

    target_day = day + pd.Timedelta(days=4)          # middle of the 7-day horizon
    mo, mo_next = target_day.month, target_day.month % 12 + 1
    yr = day.year
    out["clim_frac"] = p.clim(yr, mo, "frac_years")
    out["clim_mean"] = p.clim(yr, mo, "mean_cd")
    out["clim_frac_next"] = p.clim(yr, mo_next, "frac_years")

    C = len(p.cells)
    r7, r_prev = _w(cu.reg[None, :], t - 6, t)[0], _w(cu.reg[None, :], t - 13, t - 7)[0]
    r_ly = _w(cu.reg[None, :], t - 364, t - 358)[0]
    out["reg_fd7_log"] = np.full(C, np.log1p(r7))
    out["reg_trend"] = np.full(C, np.log1p(r7) - np.log1p(r_prev))
    out["reg_ly_fd7_log"] = np.full(C, np.log1p(r_ly))
    out["month_sin"] = np.full(C, np.sin(2 * np.pi * mo / 12))
    out["month_cos"] = np.full(C, np.cos(2 * np.pi * mo / 12))
    df = pd.DataFrame(out).astype(np.float32)
    df.insert(0, "h3_cell", p.cells)
    df.insert(1, "origin", day)
    return df


def build_dataset(p: Panel, horizon: int = 7, step: int = 7, neg_frac: float = 1.0,
                  start: pd.Timestamp | None = None, end: pd.Timestamp | None = None,
                  seed: int = 42, cu: Cumulative | None = None) -> pd.DataFrame:
    """Rows (cell, origin) for origins with enough history and a complete horizon.

    neg_frac < 1 keeps every positive and a random fraction of negatives, with `weight` = 1/neg_frac
    on the kept negatives so the weighted class balance (and probability scale) is unchanged.
    """
    cu = cu or cumulative(p)
    D = len(p.days)
    lookback = LONG_LOOKBACK if D > LONG_LOOKBACK + horizon + 30 else SHORT_LOOKBACK
    rng = np.random.default_rng(seed)
    rows = []
    for t in range(lookback - 1, D - horizon, step):
        if (start is not None and p.days[t] < start) or (end is not None and p.days[t] > end):
            continue
        f = features_at(p, t, cu)
        y = (_w(cu.fire, t + 1, t + horizon) > 0).astype(np.int8)
        f["target"] = y
        f["weight"] = np.float32(1.0)
        if neg_frac < 1.0:
            keep = (y == 1) | (rng.random(len(y)) < neg_frac)
            f = f[keep]
            f.loc[f.target == 0, "weight"] = np.float32(1.0 / neg_frac)
        rows.append(f)
    if not rows:
        raise ValueError(f"not enough daily data: need > {lookback + horizon} days, have {D}")
    return pd.concat(rows, ignore_index=True)


def latest_features(p: Panel) -> pd.DataFrame:
    """Features at the last observed day (the forecast origin)."""
    return features_at(p, len(p.days) - 1, cumulative(p))
