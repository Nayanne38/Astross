"""Before/after harmonization plot for docs."""
from __future__ import annotations

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402


def before_after_plot(regional: pd.DataFrame, metrics: pd.DataFrame, title: str, out: Path,
                      synthetic: bool = False) -> Path:
    r = regional.copy()
    r["month"] = pd.to_datetime(r["date"]).dt.to_period("M").dt.to_timestamp()
    r["modis"] = r.modis_fcd.where(r.modis_obs)
    r["viirs"] = r.viirs_fcd.where(r.viirs_obs)
    r["modis_cal"] = r.modis_calibrated
    m = r.groupby("month")[["modis", "viirs", "modis_cal", "harmonized"]].sum(min_count=1)
    ov = r[r.modis_obs & r.viirs_obs]

    fig, axes = plt.subplots(2, 1, figsize=(13, 7.5), sharex=True)
    for ax, (cols, sub) in zip(axes, [
        (["modis", "viirs"], "Before: raw fire-cell-days per month"),
        (["modis_cal", "viirs", "harmonized"], "After: MODIS calibrated to VIIRS scale; harmonized series"),
    ]):
        if not ov.empty:
            ax.axvspan(ov.date.min(), ov.date.max(), color="0.92", label="MODIS∩VIIRS overlap")
        style = {"modis": ("#d95f02", "MODIS raw", 1.0, "-"), "viirs": ("#1b9e77", "VIIRS raw", 1.0, "-"),
                 "modis_cal": ("#d95f02", "MODIS calibrated", 1.0, "--"),
                 "harmonized": ("#4b2991", "Harmonized (VIIRS-eq.)", 1.6, "-")}
        for c in cols:
            color, label, lw, ls = style[c]
            ax.plot(m.index, m[c], color=color, lw=lw, ls=ls, label=label)
        ax.set_title(sub, loc="left", fontsize=11)
        ax.set_ylabel("H3 fire-cell-days / month")
        ax.legend(loc="upper left", fontsize=8, ncol=4, frameon=False)
        ax.grid(alpha=0.3)
    q = metrics[(metrics.scope == "loyo_monthly")].set_index("method")
    txt = "Leave-one-year-out, monthly totals:  " + "   ".join(
        f"{k}: bias={q.loc[k,'bias']:+.1f}, RMSE={q.loc[k,'rmse']:.1f}, R²={q.loc[k,'r2']:.3f}"
        for k in ("raw_modis", "linear", "quantile_mapping") if k in q.index)
    fig.text(0.01, 0.005, txt, fontsize=8)
    fig.suptitle(title + ("  [SYNTHETIC SAMPLE — not real data]" if synthetic else ""),
                 fontsize=13, x=0.01, ha="left", color="crimson" if synthetic else "black")
    fig.tight_layout(rect=(0, 0.02, 1, 0.97))
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=130)
    plt.close(fig)
    return out
