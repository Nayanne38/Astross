"""Train, tune, calibrate and evaluate the 7-day fire-risk model; forecast with `ml.forecast`.

Honest evaluation (PLAN rule "never cut"):
  * strict temporal split by years (settings.yaml `ml`): train <= train_until, validation up to
    validate_until (hyper-parameters, early stopping, probability calibration), test after it.
    Origins stop `horizon` days before each boundary so no target crosses into the next block;
  * baselines every model must beat: persistence (fire in the last 7 days) and climatology
    (fraction of past years with fire in the same month in that cell);
  * metrics: ROC-AUC, PR-AUC (average precision), Brier score, capture of fires in the top 10 % cells
    and expected calibration error (ECE).

Data: `--source parquet` (default when the ETL parquet exists) uses the full daily history;
`--source db` falls back to the 365-day database window with a last-91-days test block.

Usage: python -m ml.train [--region matopiba] [--source parquet|db]
"""
from __future__ import annotations

import argparse
import itertools
import json
import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from etl.config import get_region, path, settings
from ml.features import FEATURES, build_dataset, build_panel, cumulative, load_frames

log = logging.getLogger("ml.train")
MODEL_VERSION = "lgbm-7d-v2"
BASE_PARAMS = dict(objective="binary", learning_rate=0.05, feature_fraction=0.9, bagging_fraction=0.8,
                   bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=42, num_threads=0)
GRID = {"num_leaves": [31, 127], "min_child_samples": [100, 1000]}
MAX_ROUNDS = 2000
PARQUET_START = "2016-01-01"   # daily panel start for multi-year training (fits in RAM)


def out_dir(region: str) -> Path:
    d = Path(path("processed")) / region
    d.mkdir(parents=True, exist_ok=True)
    return d


# ------------------------------------------------------------------ metrics
def ece(y: np.ndarray, p: np.ndarray, bins: int = 15) -> float:
    """Expected calibration error on quantile bins (lower is better)."""
    q = np.unique(np.quantile(p, np.linspace(0, 1, bins + 1)))
    idx = np.clip(np.searchsorted(q, p, side="right") - 1, 0, len(q) - 2)
    err = 0.0
    for b in range(len(q) - 1):
        m = idx == b
        if m.any():
            err += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(err)


def scores(y, p) -> dict:
    y = np.asarray(y); p = np.clip(np.asarray(p, dtype=float), 0, 1)
    out = {"brier": round(float(brier_score_loss(y, p)), 5), "ece": round(ece(y, p), 4)}
    if y.min() == y.max():
        return {"roc_auc": None, "pr_auc": None, **out, "top10_capture": None}
    k = max(1, int(len(p) * 0.10))
    top = np.argsort(-p)[:k]
    return {"roc_auc": round(float(roc_auc_score(y, p)), 4),
            "pr_auc": round(float(average_precision_score(y, p)), 4),
            **out, "top10_capture": round(float(y[top].sum() / y.sum()), 4)}


def baselines(df: pd.DataFrame) -> dict[str, np.ndarray]:
    # persistence as a probability: fraction of the last 7 days with fire (x2, capped)
    persistence = np.clip(df.fd7.to_numpy() / 7 * 2, 0, 1)
    # climatology: chance of >=1 fire in a 7-day window if the month's past fire probability
    # (frac_years ~ P(fire somewhere in the month)) were spread evenly over the month
    climatology = np.clip(df.clim_frac.to_numpy() * 7 / 30 * 2, 0, 1)
    return {"persistence": persistence, "climatology": climatology}


# ------------------------------------------------------------------ model
def fit(train: pd.DataFrame, params: dict, rounds: int, valid: pd.DataFrame | None = None):
    ds = lgb.Dataset(train[FEATURES], label=train.target, weight=train.get("weight"), free_raw_data=True)
    if valid is None:
        return lgb.train({**BASE_PARAMS, **params}, ds, num_boost_round=rounds)
    dv = lgb.Dataset(valid[FEATURES], label=valid.target, reference=ds)
    return lgb.train({**BASE_PARAMS, **params, "metric": "average_precision"}, ds, num_boost_round=rounds,
                     valid_sets=[dv], callbacks=[lgb.early_stopping(100, verbose=False)])


def tune(train: pd.DataFrame, valid: pd.DataFrame, grid: dict | None = None) -> tuple[dict, int, list]:
    """Small grid with early stopping on validation PR-AUC."""
    grid = grid or GRID
    trials = []
    for nl, mcs in itertools.product(grid["num_leaves"], grid["min_child_samples"]):
        params = {"num_leaves": nl, "min_child_samples": mcs}
        m = fit(train, params, MAX_ROUNDS, valid)
        ap = average_precision_score(valid.target, m.predict(valid[FEATURES], num_iteration=m.best_iteration))
        trials.append({**params, "best_iteration": int(m.best_iteration), "valid_pr_auc": round(float(ap), 4)})
        log.info("  trial %s -> PR-AUC %.4f @ %d rounds", params, ap, m.best_iteration)
    best = max(trials, key=lambda r: r["valid_pr_auc"])
    return {"num_leaves": best["num_leaves"], "min_child_samples": best["min_child_samples"]}, best["best_iteration"], trials


# ------------------------------------------------------------------ splits
def blocks_by_year(p, horizon: int, cfg: dict):
    tu, vu = pd.Timestamp(cfg["train_until"]), pd.Timestamp(cfg["validate_until"])
    h = pd.Timedelta(days=horizon)
    return {"train": (None, tu - h), "valid": (tu + pd.Timedelta(days=1), vu - h), "test": (vu + pd.Timedelta(days=1), None)}


def blocks_window(p, horizon: int, test_days: int = 91, valid_days: int = 63):
    last = p.days[-1] - pd.Timedelta(days=horizon)
    test_start = last - pd.Timedelta(days=test_days - 1)
    valid_start = test_start - pd.Timedelta(days=horizon + valid_days)
    h = pd.Timedelta(days=horizon)
    return {"train": (None, valid_start - h), "valid": (valid_start, test_start - h), "test": (test_start, None)}


# ------------------------------------------------------------------ main routine
def train_region(region: str, horizon: int = 7, source: str = "auto", step: int = 7, neg_frac: float = 0.3) -> dict:
    if source == "auto":
        source = "parquet" if (out_dir(region) / "daily_cell_counts.parquet").exists() else "db"
    frames = load_frames(region, source, start=PARQUET_START if source == "parquet" else None)
    panel = build_panel(frames)
    del frames
    cu = cumulative(panel)
    cfg = settings()["ml"]
    blocks = blocks_by_year(panel, horizon, cfg) if source == "parquet" else blocks_window(panel, horizon)
    log.info("source=%s panel cells=%d days=%d (%s..%s) blocks=%s", source, len(panel.cells), len(panel.days),
             panel.days[0].date(), panel.days[-1].date(), {k: [str(x.date()) if x is not None else None for x in v] for k, v in blocks.items()})

    sets = {k: build_dataset(panel, horizon, step, neg_frac=neg_frac if k == "train" else 1.0,
                             start=a, end=b, cu=cu) for k, (a, b) in blocks.items()}
    for k, v in sets.items():
        log.info("  %s: rows=%d origins=%s..%s pos=%.4f", k, len(v), v.origin.min().date(), v.origin.max().date(),
                 np.average(v.target, weights=v.weight))
    train, valid, test = sets["train"], sets["valid"], sets["test"]

    # 1) tune on validation, 2) calibrate on validation, 3) evaluate once on test
    params, rounds, trials = tune(train, valid)
    model = fit(train, params, rounds)
    raw_valid = model.predict(valid[FEATURES])
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(raw_valid, valid.target)
    raw_test = model.predict(test[FEATURES])
    p_test = iso.predict(raw_test)
    base = baselines(test)
    metrics = {"model": scores(test.target, p_test), "model_uncalibrated": scores(test.target, raw_test),
               **{k: scores(test.target, v) for k, v in base.items()}}
    beats = {k: (metrics["model"]["pr_auc"] or 0) > (metrics[k]["pr_auc"] or 0) for k in base}
    by_year = {}
    for y, g in test.assign(p=p_test).groupby(test.origin.dt.year):
        by_year[int(y)] = {"rows": int(len(g)), "pr_auc": scores(g.target, g.p)["pr_auc"],
                           "climatology_pr_auc": scores(g.target, baselines(g)["climatology"])["pr_auc"]}

    # production model: same hyper-parameters refit on train+valid (+ the calibrator from validation)
    final = fit(pd.concat([train, valid], ignore_index=True), params, int(rounds * 1.1))
    d = out_dir(region)
    final.save_model(str(d / f"risk_model_{horizon}d.txt"))
    with open(d / f"risk_calibrator_{horizon}d.pkl", "wb") as f:
        pickle.dump(iso, f)
    imp = dict(sorted(zip(FEATURES, final.feature_importance("gain").round(1).tolist()), key=lambda kv: -kv[1]))

    window_note = ("Split temporal por anos: treino até {tu}, validação até {vu} (hiperparâmetros, early stopping e "
                   "calibração), teste depois — nenhum alvo cruza a fronteira dos blocos.").format(
        tu=cfg["train_until"], vu=cfg["validate_until"]) if source == "parquet" else (
        "Janela de 365 dias do banco: validação e teste são os últimos ~5 meses; distribuição do teste "
        "(fim da estação seca) difere do treino.")
    report = {
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "region": region, "source": source,
        "target": f"P(>=1 fire-cell-day in the cell in the next {horizon} days)",
        "horizon_days": horizon,
        "data_window": [str(panel.days[0].date()), str(panel.days[-1].date())],
        "n_cells": int(len(panel.cells)),
        "origins_step_days": step, "train_negative_fraction": neg_frac,
        **{k: {"rows": int(len(v)), "origins": [str(v.origin.min().date()), str(v.origin.max().date())],
               "positive_rate": round(float(np.average(v.target, weights=v.weight)), 4)} for k, v in sets.items()},
        "hyperparameters": {**params, "rounds": rounds, "learning_rate": BASE_PARAMS["learning_rate"]},
        "tuning_trials": trials,
        "calibration": "isotonic regression fitted on the validation block",
        "metrics": metrics,
        "test_by_year": by_year,
        "beats_baselines_pr_auc": beats,
        "feature_importance_gain": imp,
        "notes": [
            window_note,
            "Probabilidades calibradas (regressão isotônica na validação): uma célula com 30% deve queimar ~3 em cada 10 vezes.",
            "Sem variáveis meteorológicas (chuva, umidade, vento): o modelo só usa histórico de fogo.",
        ],
    }
    (d / "ml_metrics.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("test metrics: %s", json.dumps(metrics))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--source", choices=["auto", "parquet", "db"], default="auto")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    region = get_region(args.region).key
    for h in settings()["ml"]["horizons_days"]:
        r = train_region(region, horizon=h, source=args.source)
        print(json.dumps({"metrics": r["metrics"], "test_by_year": r["test_by_year"],
                          "beats_baselines_pr_auc": r["beats_baselines_pr_auc"],
                          "hyperparameters": r["hyperparameters"]}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
