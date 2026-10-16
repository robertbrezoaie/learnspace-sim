"""Shared analysis helpers: paths, loading, run-level aggregation, intervals, palette and figure style.

All data analysed here are synthetic (simulated learners). See SIMULATION_SPEC.md section 12.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
QUICK = "--quick" in sys.argv or os.environ.get("LSIM_QUICK") == "1"
RAW = ROOT / "results" / ("quick" if QUICK else "raw")
SUMMARY = ROOT / "results" / ("quick/summary" if QUICK else "summary")
FIGURES = ROOT / ("results/quick/figures" if QUICK else "figures")
CONFIGS = ROOT / "configs"

SYNTHETIC_NOTE = "All data are synthetic (simulated learners). The simulation validates algorithmic behaviour, not learning outcomes."

# Okabe-Ito palette (SIMULATION_SPEC.md section 12.2)
OI = {
    "black": "#000000",
    "orange": "#E69F00",
    "sky": "#56B4E9",
    "green": "#009E73",
    "yellow": "#F0E442",
    "blue": "#0072B2",
    "vermillion": "#D55E00",
    "purple": "#CC79A7",
    "grey": "#999999",
}

# one fixed colour (and line style) per condition in every figure
CONDITION_STYLE = {
    "C1": dict(color=OI["black"], ls="-", label="C1 static"),
    "C2": dict(color=OI["sky"], ls="-", label="C2 DDA-E, plain feedback"),
    "B-RANDOM": dict(color=OI["orange"], ls="-", label="RANDOM"),
    "B-HINT": dict(color=OI["yellow"], ls="--", label="FIXED hint"),
    "B-EXAMPLE": dict(color=OI["yellow"], ls=":", label="FIXED example"),
    "B-TS": dict(color=OI["blue"], ls="-", label="TS_DEPLOYED"),
    "B-TSPURE": dict(color=OI["green"], ls="-", label="TS_PURE"),
    "B-TSCTX": dict(color=OI["purple"], ls="-", label="TS_CTX"),
    "B-ORACLE": dict(color=OI["vermillion"], ls="-", label="ORACLE"),
}

# pipeline view (RQ3): condition -> EXP-P cell
PIPELINE_VIEW = {"C1": "C1", "C2": "C2", "C3": "B-RANDOM", "C4": "B-TS", "C5": "B-ORACLE"}
PIPELINE_LABELS = {
    "C1": "C1 static",
    "C2": "C2 DDA-E",
    "C3": "C3 DDA-E + random feedback",
    "C4": "C4 DDA-E + TS bandit",
    "C5": "C5 DDA-E + oracle",
}
BANDIT_CELLS = ["C2", "B-RANDOM", "B-HINT", "B-EXAMPLE", "B-TS", "B-TSPURE", "B-TSCTX", "B-ORACLE"]
ARM_CELL = {"plain": "C2", "hint": "B-HINT", "example": "B-EXAMPLE"}

CM = 1 / 2.54
FULL_WIDTH = 16 * CM
HALF_WIDTH = 8 * CM


def style() -> None:
    plt.rcParams.update(
        {
            "font.size": 8,
            "axes.titlesize": 8,
            "axes.labelsize": 8,
            "xtick.labelsize": 7.5,
            "ytick.labelsize": 7.5,
            "legend.fontsize": 7.5,
            "font.family": "DejaVu Sans",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "pdf.fonttype": 42,
            "svg.hashsalt": "learnspace-sim",
        }
    )


def savefig(fig, name: str) -> list[str]:
    FIGURES.mkdir(parents=True, exist_ok=True)
    paths = []
    for ext, kw in (("pdf", {"metadata": {"CreationDate": None}}), ("png", {"dpi": 600})):
        p = FIGURES / f"{name}.{ext}"
        fig.savefig(p, bbox_inches="tight", **kw)
        paths.append(str(p.relative_to(ROOT)))
    plt.close(fig)
    return paths


# ---------- loading ----------


def read(rel: str) -> pd.DataFrame:
    return pd.read_csv(RAW / rel)


def exists(rel: str) -> bool:
    return (RAW / rel).exists()


def run_meta(exp: str) -> dict:
    p = RAW / exp / "run_meta.json"
    return json.loads(p.read_text()) if p.exists() else {}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def pipeline_runs() -> pd.DataFrame:
    """Run-level means over learners (cell x scenario x seed). Learners without a value for a metric are skipped."""
    lr = read("pipeline/learners.csv.gz")
    lr["QUIT"] = np.where(lr["sessions_attended"] > 0, lr["quits"] / lr["sessions_attended"].clip(lower=1), np.nan)
    agg = lr.groupby(["cell", "scenario", "seed"]).agg(
        TIB=("TIB", "mean"),
        FAS=("FAS", "mean"),
        RTS=("RTS", "mean"),
        TASKS=("tasks", "mean"),
        CHURN=("churned", "mean"),
        QUIT=("QUIT", "mean"),
        E_mean=("E_mean", "mean"),
        FRUS=("FRUS", "mean"),
        BORE=("BORE", "mean"),
        delta_theta=("delta_theta", "mean"),
        mistakes=("mistakes", "mean"),
        n_expl_reward=("n_expl_reward", "mean"),
        n_expl_diff=("n_expl_diff", "mean"),
    )
    runs = read("pipeline/runs.csv.gz").set_index(["cell", "scenario", "seed"])
    return agg.join(runs[["decisions", "REG_oracle", "REG_fixed", "VAL", "best_fixed_arm", "T95"]]).reset_index()


# ---------- statistics (SIMULATION_SPEC.md section 12.1) ----------


def mean_ci(x) -> dict:
    """Mean over runs with a 95% t-interval."""
    x = np.asarray(pd.Series(x).dropna(), dtype=float)
    n = len(x)
    if n == 0:
        return {"mean": None, "ci_low": None, "ci_high": None, "n": 0}
    m = float(x.mean())
    if n < 2:
        return {"mean": m, "ci_low": None, "ci_high": None, "n": n}
    h = float(stats.t.ppf(0.975, n - 1) * x.std(ddof=1) / math.sqrt(n))
    return {"mean": m, "ci_low": m - h, "ci_high": m + h, "n": n}


def paired_diff(df: pd.DataFrame, key: str, a, b, value: str, by: str | list[str] = "seed") -> dict:
    """Seed-paired difference a - b of `value` (rows where df[key] == a or b), with a 95% t-interval."""
    pa = df[df[key] == a].set_index(by)[value]
    pb = df[df[key] == b].set_index(by)[value]
    d = (pa - pb).dropna()
    return mean_ci(d)


def holds(ci: dict, sign: int) -> bool | None:
    """A predicted result holds when the paired mean difference has the predicted sign and its 95% CI excludes 0."""
    if ci["ci_low"] is None:
        return None
    return bool(ci["ci_low"] > 0) if sign > 0 else bool(ci["ci_high"] < 0)


def wilson(k: int, n: int) -> dict:
    """Proportion with a Wilson 95% interval."""
    if n == 0:
        return {"mean": None, "ci_low": None, "ci_high": None, "n": 0}
    z = stats.norm.ppf(0.975)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return {"mean": p, "ci_low": centre - h, "ci_high": centre + h, "n": n, "k": int(k)}


def fmt_ci(d: dict, digits: int = 3) -> str:
    if d is None or d.get("mean") is None:
        return "n/a"
    if d.get("ci_low") is None:
        return f"{d['mean']:.{digits}f}"
    return f"{d['mean']:.{digits}f} [{d['ci_low']:.{digits}f}, {d['ci_high']:.{digits}f}]"
