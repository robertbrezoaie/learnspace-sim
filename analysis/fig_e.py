"""Fig E (RQ2): field replica, ID90 (S1-S3) and FID90 (S0) vs number of learners."""
import matplotlib.pyplot as plt

from common import HALF_WIDTH, OI, read, savefig, style, wilson

CAPTION = (
    "Field-study replica (synthetic learners; one 12-question session per learner; TS_DEPLOYED with 50% random allocation; "
    "500 runs per point). ID90: share of runs in which the posterior probability that the truly best arm is best reaches 0.9 "
    "(S1-S3). FID90: share of S0 runs (no real difference) in which some arm reaches 0.9 (false identification). "
    "Whiskers: Wilson 95% intervals."
)

STYLE = {"S1": (OI["blue"], "-", "ID90, S1 homogeneous"), "S2": (OI["green"], "-", "ID90, S2 expertise reversal"),
         "S3": (OI["purple"], "-", "ID90, S3 small effect"), "S0": (OI["vermillion"], "--", "FID90, S0 null")}


def make(num: dict, extra: dict) -> dict:
    style()
    f = read("field/runs.csv.gz")
    fig, ax = plt.subplots(figsize=(HALF_WIDTH, 6.0 / 2.54))
    for sc in ["S1", "S2", "S3", "S0"]:
        col = "FID90" if sc == "S0" else "ID90"
        pts = []
        for n in sorted(f.N.unique()):
            d = f[(f.N == n) & (f.scenario == sc)]
            w = wilson(int(d[col].sum()), len(d))
            pts.append((n, w["mean"], w["mean"] - w["ci_low"], w["ci_high"] - w["mean"]))
        color, ls, label = STYLE[sc]
        ax.errorbar([p[0] for p in pts], [p[1] for p in pts], yerr=[[p[2] for p in pts], [p[3] for p in pts]],
                    color=color, ls=ls, marker="o", ms=3, capsize=2, lw=1, label=label)
    ax.set_xlabel("learners in the field study (N)")
    ax.set_ylabel("share of runs")
    ax.set_ylim(0, 1)
    ax.set_xticks(sorted(f.N.unique()))
    ax.legend(frameon=False, fontsize=6.5)
    return {"id": "Fig E", "paths": savefig(fig, "fig_e_field"), "caption": CAPTION}
