"""Every number the paper may quote, written to results/summary/paper_numbers.json under flat keys.

All data are synthetic (simulated learners). Unit of replication: the run. Comparisons are seed-paired
(common random numbers) with 95% t-intervals; field-replica proportions use Wilson intervals.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import (
    ARM_CELL,
    BANDIT_CELLS,
    PIPELINE_VIEW,
    QUICK,
    RAW,
    ROOT,
    SUMMARY,
    SYNTHETIC_NOTE,
    exists,
    holds,
    load_json,
    mean_ci,
    paired_diff,
    pipeline_runs,
    read,
    run_meta,
    wilson,
)

PIPELINE_METRICS = ["TIB", "FAS", "RTS", "TASKS", "CHURN", "QUIT", "E_mean", "FRUS", "BORE", "delta_theta"]
BANDIT_METRICS = ["REG_fixed", "REG_oracle", "VAL"]
TS_CELLS = ["B-TS", "B-TSPURE"]


def flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else str(k)
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def clean(v):
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


# ---------- RQ3: pipeline view ----------


def pipeline_numbers(pr: pd.DataFrame) -> dict:
    s2 = pr[pr.scenario == "S2"]
    out: dict = {}
    for cond, cell in PIPELINE_VIEW.items():
        d = s2[s2.cell == cell]
        out[cond] = {m: mean_ci(d[m]) for m in PIPELINE_METRICS}
    s2c = s2.assign(cond=s2.cell.map({v: k for k, v in PIPELINE_VIEW.items()}))
    out["diff"] = {
        "C2_minus_C1": {m: paired_diff(s2c, "cond", "C2", "C1", m) for m in PIPELINE_METRICS},
        "C4_minus_C3": {m: paired_diff(s2c, "cond", "C4", "C3", m) for m in PIPELINE_METRICS},
        "C5_minus_C4": {m: paired_diff(s2c, "cond", "C5", "C4", m) for m in PIPELINE_METRICS},
        "C4_minus_C2": {m: paired_diff(s2c, "cond", "C4", "C2", m) for m in PIPELINE_METRICS},
    }
    out["n_seeds"] = int(s2[s2.cell == "C1"].seed.nunique())
    return out


# ---------- RQ2: bandit view ----------


def bandit_numbers(pr: pd.DataFrame) -> dict:
    out: dict = {}
    for sc in sorted(pr.scenario.unique()):
        d = pr[pr.scenario == sc]
        if not set(BANDIT_CELLS) & set(d.cell):
            continue
        s: dict = {}
        for cell in BANDIT_CELLS:
            dc = d[d.cell == cell]
            if dc.empty:
                continue
            s[cell] = {m: mean_ci(dc[m]) for m in BANDIT_METRICS + ["decisions"]}
            if cell in TS_CELLS:
                reached = dc["T95"].notna()
                s[cell]["T95_reached_share"] = float(reached.mean())
                s[cell]["T95_median_if_reached"] = float(dc.loc[reached, "T95"].median()) if reached.any() else None
        arms = d[d.cell == "B-ORACLE"].best_fixed_arm.dropna()
        s["best_fixed_arm"] = arms.mode().iloc[0] if len(arms) else None
        s["diff"] = {
            "TS_minus_RANDOM": {m: paired_diff(d, "cell", "B-TS", "B-RANDOM", m) for m in BANDIT_METRICS},
            "TSCTX_minus_TS": {m: paired_diff(d, "cell", "B-TSCTX", "B-TS", m) for m in BANDIT_METRICS},
            "TSPURE_minus_TS": {m: paired_diff(d, "cell", "B-TSPURE", "B-TS", m) for m in BANDIT_METRICS},
        }
        out[sc] = s
    return out


# ---------- RQ1: explanation audit ----------


def x1_numbers() -> dict:
    x1 = read("explain/x1_rules.csv.gz")
    out: dict = {}
    for output in ["reward", "difficulty"]:
        o: dict = {}
        d = x1[x1.output == output]
        for rule in ["v1", "v2", "random"]:
            dr = d[d.rule == rule]
            o[rule] = {m: mean_ci(dr[m]) for m in ["NC", "SI", "DN", "SU", "AGR"]}
            o[rule]["n_decisions"] = int(dr.n.sum())
            o[rule]["by_cell"] = {c: {m: mean_ci(dr[dr.cell == c][m]) for m in ["NC", "DN", "SU"]} for c in sorted(dr.cell.unique())}
        d2 = d.assign(run=d.cell + "|" + d.seed.astype(str))
        o["diff"] = {
            "v2_minus_v1": {m: paired_diff(d2, "rule", "v2", "v1", m, by="run") for m in ["DN", "SU", "NC", "SI"]},
            "v2_minus_random": {m: paired_diff(d2, "rule", "v2", "random", m, by="run") for m in ["DN", "SU", "NC", "SI"]},
        }
        out[output] = o
    out["n_runs"] = int(x1[["cell", "seed"]].drop_duplicates().shape[0])
    return out


def x2_numbers() -> dict:
    x2 = read("explain/x2_stability.csv.gz")
    out: dict = {"reward": {}, "difficulty": {}}
    r = x2[x2.output == "reward"].assign(run=lambda t: t.cell + "|" + t.seed.astype(str))
    for sd in sorted(r.noise_sd.unique()):
        key = f"sd{sd:g}"
        out["reward"][key] = {}
        for t in sorted(r.delta_tie.unique()):
            d = r[(r.noise_sd == sd) & (r.delta_tie == t)]
            out["reward"][key][f"tie{t:g}"] = {m: mean_ci(d[m]) for m in ["ST_exact", "ST_jaccard", "TF", "category_change_share"]}
        d = r[r.noise_sd == sd]
        out["reward"][key]["diff_tie0.2_minus_tie0"] = {
            m: paired_diff(d, "delta_tie", 0.2, 0.0, m, by="run") for m in ["ST_exact", "ST_jaccard"]
        }
    dd = x2[(x2.output == "difficulty") & (x2.delta_tie == x2.delta_tie.min())]
    for sd in sorted(dd.noise_sd.unique()):
        out["difficulty"][f"sd{sd:g}"] = {"category_change_share": mean_ci(dd[dd.noise_sd == sd].category_change_share)}
    tf = r[r.noise_sd == r.noise_sd.min()]
    out["reward"]["TF_by_tie"] = {f"tie{t:g}": mean_ci(tf[tf.delta_tie == t].TF) for t in sorted(tf.delta_tie.unique())}
    return out


def x3_numbers(algo: dict) -> dict:
    x3 = read("explain/x3_weights.csv.gz")
    a, b = algo["reward"]["alpha"], algo["reward"]["beta"]
    out: dict = {}
    for t in sorted(x3.delta_tie.unique()):
        d = x3[x3.delta_tie == t]
        dflt = d[np.isclose(d.alpha, a) & np.isclose(d.beta, b)].iloc[0]
        out[f"tie{t:g}"] = {
            "default": {m: float(dflt[m]) for m in ["XR", "TF", "DN", "ST_exact"]},
            "grid_min": {m: float(d[m].min()) for m in ["XR", "TF", "DN", "ST_exact"]},
            "grid_max": {m: float(d[m].max()) for m in ["XR", "TF", "DN", "ST_exact"]},
            "n_points": int(len(d)),
        }
    return out


def x4_numbers() -> dict:
    x4 = read("explain/x4_exposure.csv.gz")
    out = {}
    for output in ["reward", "difficulty"]:
        d = x4[x4.output == output]
        out[output] = {"per_session_mean": mean_ci(d["mean"]), "p90_mean": float(d.p90.mean()), "share_zero": mean_ci(d.share_zero)}
    return out


# ---------- RQ2: field replica ----------


def field_numbers() -> dict:
    f = read("field/runs.csv.gz")
    out: dict = {}
    for n in sorted(f.N.unique()):
        o: dict = {}
        for sc in sorted(f.scenario.unique()):
            d = f[(f.N == n) & (f.scenario == sc)]
            o[sc] = {"decisions": mean_ci(d.decisions), "mistakes_per_learner": mean_ci(d.mistakes_per_learner)}
            if sc == "S0":
                o[sc]["FID90"] = wilson(int(d.FID90.sum()), len(d))
            else:
                o[sc]["ID90"] = wilson(int(d.ID90.sum()), len(d))
                o[sc]["true_best_arm"] = d.true_best_arm.mode().iloc[0]
        out[f"N{n}"] = o
    out["runs_per_cell"] = int(f.groupby(["N", "scenario"]).size().min())
    return out


# ---------- robustness (EXP-S) ----------


def sensitivity_k() -> pd.DataFrame:
    """K1-K4 per sensitivity setting: estimate, CI and whether it holds."""
    runs = read("sensitivity/runs.csv.gz")
    x1 = read("sensitivity/x1_rules.csv.gz")
    x2 = read("sensitivity/x2_stability.csv.gz")
    rows = []
    for setting, g in runs.groupby("setting", sort=False):
        param, level = g.param.iloc[0], g.level.iloc[0]
        value = g.value.iloc[0]
        s2 = g[g.scenario == "S2"]
        s1 = g[g.scenario == "S1"]
        k3a = paired_diff(s1, "cell", "B-TS", "B-RANDOM", "REG_fixed")
        k3b = paired_diff(s2, "cell", "B-TS", "B-RANDOM", "REG_fixed")
        k4 = paired_diff(s2, "cell", "B-TS", "B-RANDOM", "RTS")
        tib = paired_diff(s2, "cell", "C2", "C1", "TIB")
        xr = x1[(x1.setting == setting) & (x1.output == "reward")]
        k1 = paired_diff(xr, "rule", "v2", "v1", "DN")
        xs = x2[(x2.setting == setting) & (x2.output == "reward")]
        k2 = paired_diff(xs, "delta_tie", 0.2, 0.0, "ST_exact")
        h3 = [holds(k3a, -1), holds(k3b, -1)]
        rows.append(
            dict(
                setting=setting, param=param, level=level, value=value,
                K1=k1["mean"], K1_lo=k1["ci_low"], K1_hi=k1["ci_high"], K1_holds=holds(k1, +1),
                K2=k2["mean"], K2_lo=k2["ci_low"], K2_hi=k2["ci_high"], K2_holds=holds(k2, +1),
                K3_S1=k3a["mean"], K3_S1_lo=k3a["ci_low"], K3_S1_hi=k3a["ci_high"],
                K3_S2=k3b["mean"], K3_S2_lo=k3b["ci_low"], K3_S2_hi=k3b["ci_high"],
                K3_holds=None if None in h3 else all(h3),
                K4=k4["mean"], K4_lo=k4["ci_low"], K4_hi=k4["ci_high"], K4_holds=holds(k4, +1),
                TIB_C2_minus_C1=tib["mean"], TIB_lo=tib["ci_low"], TIB_hi=tib["ci_high"],
            )
        )
    return pd.DataFrame(rows)


def robustness_numbers(sk: pd.DataFrame) -> dict:
    out = {"n_settings": int(len(sk)), "n_settings_excluding_default": int((sk.setting != "default").sum())}
    for k in ["K1", "K2", "K3", "K4"]:
        h = sk[f"{k}_holds"]
        out[k] = {"holds": int((h == True).sum()), "of": int(h.notna().sum())}  # noqa: E712
        failing = sk.loc[h == False, "setting"].tolist()  # noqa: E712
        out[k]["failing_settings"] = ", ".join(failing) if failing else ""
    return out


# ---------- pre-registered expected results ----------


def k_results(num: dict) -> dict:
    k1 = num["x1"]["reward"]["diff"]["v2_minus_v1"]["DN"]
    k2 = num["x2"]["reward"]["sd0.1"]["diff_tie0.2_minus_tie0"]["ST_exact"]
    k3_s1 = num["bandit"]["S1"]["diff"]["TS_minus_RANDOM"]["REG_fixed"]
    k3_s2 = num["bandit"]["S2"]["diff"]["TS_minus_RANDOM"]["REG_fixed"]
    k4 = num["pipeline"]["diff"]["C4_minus_C3"]["RTS"]
    h3 = [holds(k3_s1, -1), holds(k3_s2, -1)]
    return {
        "K1": {"estimate": k1, "predicted_sign": "+", "holds": holds(k1, +1), "statement": "On reward decisions, DN is higher for v2 than for v1."},
        "K2": {"estimate": k2, "predicted_sign": "+", "holds": holds(k2, +1), "statement": "At sigma_n = 0.10, ST_exact on reward decisions is higher with delta_tie = 0.2 than with delta_tie = 0."},
        "K3": {"estimate_S1": k3_s1, "estimate_S2": k3_s2, "predicted_sign": "-", "holds": None if None in h3 else all(h3), "statement": "In S1 and S2, the final REG_fixed of TS_DEPLOYED is lower than that of RANDOM."},
        "K4": {"estimate": k4, "predicted_sign": "+", "holds": holds(k4, +1), "statement": "RTS is higher in C4 than in C3."},
    }


def compute() -> tuple[dict, dict]:
    """Returns (nested numbers, extra tables for figures)."""
    algo = load_json(ROOT / "configs" / "algorithm.default.json")
    num: dict = {}
    extra: dict = {}
    pr = pipeline_runs()
    extra["pipeline_runs"] = pr
    num["pipeline"] = pipeline_numbers(pr)
    num["bandit"] = bandit_numbers(pr)
    if exists("explain/x1_rules.csv.gz"):
        num["x1"] = x1_numbers()
        num["x2"] = x2_numbers()
        num["x3"] = x3_numbers(algo)
        num["x4"] = x4_numbers()
        num["explain_counts"] = json.loads((RAW / "explain" / "audit_counts.json").read_text())
    if exists("field/runs.csv.gz"):
        num["field"] = field_numbers()
    cal = ROOT / "results" / "summary" / "calibration.json"  # calibration is never a quick run
    if cal.exists():
        c = load_json(cal)
        num["calibration"] = {
            "tiers": {t: {k: v for k, v in d.items()} for t, d in c["field_tiers"].items()},
            "plausibility": {k: {kk: vv for kk, vv in v.items() if kk in ("value", "min", "max", "pass")} for k, v in c["plausibility"].items()},
        }
    if exists("sensitivity/runs.csv.gz"):
        sk = sensitivity_k()
        extra["sensitivity_k"] = sk
        num["robustness"] = robustness_numbers(sk)
    if "x1" in num:
        num["k"] = k_results(num)
    return num, extra


def write(num: dict) -> dict:
    flat = {k: clean(v) for k, v in flatten(num).items()}
    meta = {
        "synthetic_data": True,
        "note": SYNTHETIC_NOTE,
        "quick": QUICK,
        "publishable": not QUICK and all(run_meta(e).get("publishable", False) for e in ["pipeline", "field", "explain"] if run_meta(e)),
        "run_meta": {e: {k: run_meta(e).get(k) for k in ("git_commit", "git_dirty", "publishable", "config_sha256", "node_version", "started", "duration_seconds")} for e in ["cal", "pipeline", "field", "explain", "sensitivity"] if run_meta(e)},
    }
    SUMMARY.mkdir(parents=True, exist_ok=True)
    (SUMMARY / "paper_numbers.json").write_text(json.dumps({"meta": meta, "numbers": flat}, indent=1, sort_keys=False) + "\n")
    return flat


if __name__ == "__main__":
    n, _ = compute()
    f = write(n)
    print(f"wrote {len(f)} numbers to {SUMMARY / 'paper_numbers.json'}")
