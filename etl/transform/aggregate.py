"""H3 aggregation: detections -> per-cell-day counts per sensor family.

Cross-satellite deduplication: detections of the same family on the same day are snapped to a
footprint-sized grid (MODIS ~1 km, VIIRS ~375 m). Terra+Aqua (or SNPP+NOAA-20+NOAA-21)
detections falling in the same footprint cell are counted once. The main harmonization unit
is the binary fire-cell-day flag, which is insensitive to how many pixels a fire lights up.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import h3

FOOTPRINT_DEG = {"MODIS": 0.01, "VIIRS": 0.004}


def add_h3(df: pd.DataFrame, res: int) -> pd.DataFrame:
    """Adds h3_cell as uint64 (memory-friendly). Use cell_str() for the string form."""
    from h3.api import numpy_int as h3n
    lat, lon = df.lat.to_numpy(), df.lon.to_numpy()
    cells = np.fromiter((h3n.latlng_to_cell(a, b, res) for a, b in zip(lat, lon)),
                        dtype=np.uint64, count=len(df))
    return df.assign(h3_cell=cells)


def cell_str(cells) -> np.ndarray:
    """uint64 H3 ids -> canonical hex strings."""
    arr = np.asarray(cells, dtype=np.uint64)
    u, inv = np.unique(arr, return_inverse=True)
    names = np.array([h3.int_to_str(int(c)) for c in u], dtype=object)
    return names[inv]


def dedup_cross_satellite(df: pd.DataFrame) -> pd.DataFrame:
    """Keep one detection per (family, day, footprint), preferring the highest FRP.

    A single snapping grid would split near-identical detections that straddle a grid line, so
    we run 4 passes on grids shifted by half a step in x and/or y. Two same-family, same-day
    detections closer than half a footprint in both axes are guaranteed to share a cell in at
    least one pass and are merged.
    """
    df = df.sort_values("frp", ascending=False, na_position="last")
    for sx, sy in ((0, 0), (0.5, 0), (0, 0.5), (0.5, 0.5)):
        st = df.sensor_family.map(FOOTPRINT_DEG).to_numpy()
        key_i = np.floor(df.lat.to_numpy() / st + sy).astype(np.int64)
        key_j = np.floor(df.lon.to_numpy() / st + sx).astype(np.int64)
        dup = pd.DataFrame({"f": df.sensor_family.to_numpy(), "d": df.date.to_numpy(),
                            "i": key_i, "j": key_j}).duplicated()
        df = df[~dup.to_numpy()]
    return df.sort_values(["date", "time_utc"]).reset_index(drop=True)


def viirs_reference_days(spans: pd.DataFrame, priority: list[str]) -> pd.Series:
    """spans: rows (satellite, min, max) of VIIRS product coverage -> Series date -> ref satellite.

    Each day gets the first satellite in `priority` whose products cover that day.
    """
    ref = pd.Series(dtype=object)
    for sat in priority:
        for _, r in spans[spans.satellite == sat].iterrows():
            days = pd.date_range(r["min"], r["max"], freq="D")
            new = days.difference(ref.index)
            ref = pd.concat([ref, pd.Series(sat, index=new)])
    return ref.sort_index()


def mark_viirs_reference(det: pd.DataFrame, ref_days: pd.Series) -> pd.DataFrame:
    """Adds boolean `viirs_ref`: VIIRS detection from that day's reference satellite."""
    ref_sat = det["date"].map(ref_days)
    return det.assign(viirs_ref=(det.sensor_family == "VIIRS").to_numpy()
                      & (det.satellite.astype(str).to_numpy() == ref_sat.astype(str).to_numpy()))


def daily_cell_counts(det: pd.DataFrame, ref_det: pd.DataFrame | None = None) -> pd.DataFrame:
    """det must have h3_cell and be cross-satellite deduplicated.

    viirs_count counts all VIIRS satellites (after footprint dedup); viirs_fire (the
    harmonization unit) uses only `ref_det` (reference-satellite VIIRS detections, taken BEFORE
    cross-satellite dedup so they are not displaced by another satellite's pixel) when given.
    """
    g = det.groupby(["h3_cell", "date", "sensor_family"]).agg(n=("lat", "size"), frp=("frp", "sum"))
    wide = g["n"].unstack("sensor_family", fill_value=0)
    for fam in ("MODIS", "VIIRS"):
        if fam not in wide:
            wide[fam] = 0
    out = pd.DataFrame({
        "modis_count": wide["MODIS"].astype(int),
        "viirs_count": wide["VIIRS"].astype(int),
        "frp_sum": g["frp"].groupby(level=["h3_cell", "date"]).sum(),
    }).reset_index()
    out["modis_fire"] = out.modis_count > 0
    if ref_det is not None:
        ref = ref_det.groupby(["h3_cell", "date"]).size()
        key = pd.MultiIndex.from_frame(out[["h3_cell", "date"]])
        out["viirs_fire"] = ref.reindex(key).fillna(0).to_numpy() > 0
    else:
        out["viirs_fire"] = out.viirs_count > 0
    # cells seen only by a non-reference VIIRS satellite still exist (viirs_count>0) but are not fire-cell-days
    out["source_mix"] = np.select([out.modis_fire & out.viirs_fire, out.viirs_fire],
                                  ["BOTH", "VIIRS"], "MODIS")
    return out


def regional_daily(cells: pd.DataFrame, start, end) -> pd.DataFrame:
    """Daily regional fire-cell-day counts per family, with all days present (zeros kept)."""
    days = pd.date_range(start, end, freq="D")
    s = cells.groupby("date").agg(modis_fcd=("modis_fire", "sum"), viirs_fcd=("viirs_fire", "sum"),
                                  modis_hotspots=("modis_count", "sum"),
                                  viirs_hotspots=("viirs_count", "sum"))
    return s.reindex(days, fill_value=0).rename_axis("date").reset_index()
