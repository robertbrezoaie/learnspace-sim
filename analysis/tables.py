"""Tables 1-3 (SIMULATION_SPEC.md section 12.3), written as CSV, Markdown and LaTeX to results/summary/."""
from __future__ import annotations

import pandas as pd

from common import BANDIT_CELLS, CONDITION_STYLE, PIPELINE_LABELS, PIPELINE_VIEW, ROOT, SUMMARY, fmt_ci, load_json


def _md(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(str(r[c]) for c in cols) + " |")
    return "\n".join(lines) + "\n"


def _tex(df: pd.DataFrame, caption: str, label: str) -> str:
    esc = lambda s: str(s).replace("_", r"\_").replace("%", r"\%").replace("&", r"\&").replace("#", r"\#")  # noqa: E731
    cols = list(df.columns)
    out = [r"\begin{table}[H]", r"\caption{" + esc(caption) + "}", r"\label{" + label + "}", r"\centering", r"\small",
           r"\begin{tabular}{" + "l" * len(cols) + "}", r"\toprule", " & ".join(esc(c) for c in cols) + r" \\", r"\midrule"]
    for _, r in df.iterrows():
        out.append(" & ".join(esc(r[c]) for c in cols) + r" \\")
    out += [r"\bottomrule", r"\end{tabular}", r"\end{table}"]
    return "\n".join(out) + "\n"


def _write(df: pd.DataFrame, name: str, caption: str) -> str:
    SUMMARY.mkdir(parents=True, exist_ok=True)
    df.to_csv(SUMMARY / f"{name}.csv", index=False)
    (SUMMARY / f"{name}.md").write_text(f"{caption}\n\n" + _md(df))
    (SUMMARY / f"{name}.tex").write_text(_tex(df, caption, f"tab:{name}"))
    return _md(df)


def table1() -> tuple[str, str]:
    """Parameter table generated from the configs."""
    rows = []
    learner = load_json(ROOT / "configs" / "learner.default.json")
    for group, entries in learner.items():
        if group.startswith("_"):
            continue
        for name, e in entries.items():
            if name.startswith("_"):
                continue
            rng = "" if e["range"] is None else f"{e['range'][0]:g} to {e['range'][1]:g}"
            rows.append({"part": "learner model", "group": group, "parameter": name, "value": f"{e['value']:g}", "range (EXP-S)": rng, "source": e["source"]})
    algo = load_json(ROOT / "configs" / "algorithm.default.json")

    def walk(d, group):
        for k, v in d.items():
            if k.startswith("_"):
                continue
            if isinstance(v, dict) and not {"a", "b"} == set(v):
                walk(v, f"{group}.{k}" if group else k)
            else:
                val = v if not isinstance(v, (list, dict)) else (", ".join(v) if isinstance(v, list) else f"Beta({v['a']}, {v['b']})")
                rows.append({"part": "algorithm", "group": group, "parameter": k, "value": str(val), "range (EXP-S)": "", "source": "design parameter of the algorithm (SIMULATION_SPEC.md section 6.9)"})

    walk(algo, "")
    caption = "Table 1. Simulation parameters (generated from configs/*.json). Learner-model values are stylised unless a source is given; data are synthetic."
    return _write(pd.DataFrame(rows), "table1_parameters", caption), caption


def table2(num: dict) -> tuple[str, str]:
    """Main results with 95% CIs: pipeline view (S2) and bandit view (S2)."""
    rows = []
    p = num["pipeline"]
    for c in PIPELINE_VIEW:
        rows.append({"view": "pipeline (S2)", "condition": PIPELINE_LABELS[c], "TIB": fmt_ci(p[c]["TIB"]), "FAS": fmt_ci(p[c]["FAS"]),
                     "RTS": fmt_ci(p[c]["RTS"]), "CHURN": fmt_ci(p[c]["CHURN"]), "FRUS": fmt_ci(p[c]["FRUS"], 2),
                     "BORE": fmt_ci(p[c]["BORE"], 2), "delta_theta": fmt_ci(p[c]["delta_theta"], 2)})
    df1 = pd.DataFrame(rows)
    rows = []
    b = num["bandit"]["S2"]
    for cell in BANDIT_CELLS:
        if cell not in b:
            continue
        rows.append({"view": "bandit (S2)", "policy": CONDITION_STYLE[cell]["label"], "REG_fixed": fmt_ci(b[cell]["REG_fixed"], 1),
                     "REG_oracle": fmt_ci(b[cell]["REG_oracle"], 1), "VAL": fmt_ci(b[cell]["VAL"]), "decisions": fmt_ci(b[cell]["decisions"], 0)})
    df2 = pd.DataFrame(rows)
    caption = ("Table 2. Main results, mean over seeds with 95% t-intervals (synthetic learners; EXP-P, N = 500, 20 sessions, "
               f"{p['n_seeds']} seeds). Top: pipeline view in S2. Bottom: bandit view in S2 (C2 plays the role of the fixed plain arm).")
    md1 = _write(df1, "table2a_pipeline", caption + " (pipeline view)")
    md2 = _write(df2, "table2b_bandit", caption + " (bandit view)")
    return md1 + "\n" + md2, caption


def table3(num: dict) -> tuple[str, str]:
    """Robustness: in how many sensitivity settings each of K1-K4 holds."""
    r = num["robustness"]
    k = num.get("k", {})
    rows = []
    for key in ["K1", "K2", "K3", "K4"]:
        main = k.get(key, {}).get("holds")
        rows.append({"expected result": key, "statement": k.get(key, {}).get("statement", ""),
                     "holds in main run": {True: "yes", False: "no", None: "n/a"}[main],
                     "holds in EXP-S settings": f"{r[key]['holds']} of {r[key]['of']}",
                     "settings where it does not hold": r[key]["failing_settings"] or "none"})
    caption = ("Table 3. Robustness of the pre-registered expected results (synthetic learners). EXP-S: one-at-a-time settings "
               "(default plus each ranged learner parameter at its low and high value; N = 300, 10 seeds; explanation metrics on 3 seeds). "
               "A result holds when the seed-paired mean difference has the predicted sign and its 95% t-interval excludes 0.")
    return _write(pd.DataFrame(rows), "table3_robustness", caption), caption
