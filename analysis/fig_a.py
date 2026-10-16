"""Fig A (RQ1, X1): NC, SI, DN and SU for the v1, v2 and random rules; one panel per output."""
import matplotlib.pyplot as plt
import numpy as np

from common import FULL_WIDTH, OI, savefig, style

RULES = [("v1", "v1 (original global argmax)", OI["orange"]), ("v2", "v2 (decision-specific)", OI["blue"]), ("random", "random factor", OI["grey"])]
METRICS = ["NC", "SI", "DN", "SU"]

CAPTION = (
    "Explanation rules compared on the same explained decisions (synthetic learners; EXP-P cells C2 and B-TS, "
    "scenario S2, seeds 1-5). NC: names a factor that is not an input of the output; SI: primary factor has the "
    "opposite sign to the decision; DN: neutralising the named factor(s) changes the decision category; SU: the named "
    "factor(s) alone keep the category. Bars: mean over runs; whiskers: 95% t-intervals. NC and SI are 0 for v2 by construction."
)


def make(num: dict, extra: dict) -> dict:
    style()
    fig, axes = plt.subplots(1, 2, figsize=(FULL_WIDTH, 6.0 / 2.54), sharey=True)
    for ax, output, title in zip(axes, ["reward", "difficulty"], ["(a) reward decisions", "(b) difficulty decisions"]):
        x = np.arange(len(METRICS))
        w = 0.26
        for i, (rule, label, color) in enumerate(RULES):
            d = num["x1"][output][rule]
            means = [d[m]["mean"] for m in METRICS]
            lo = [d[m]["mean"] - (d[m]["ci_low"] if d[m]["ci_low"] is not None else d[m]["mean"]) for m in METRICS]
            hi = [(d[m]["ci_high"] if d[m]["ci_high"] is not None else d[m]["mean"]) - d[m]["mean"] for m in METRICS]
            ax.bar(x + (i - 1) * w, means, w, color=color, label=label, yerr=[lo, hi], capsize=1.5, error_kw={"lw": 0.6})
        ax.set_xticks(x, METRICS)
        ax.set_ylim(0, 1.05)
        ax.set_xlabel(title)
    axes[0].set_ylabel("share of explained decisions")
    axes[0].legend(frameon=False, loc="lower left", bbox_to_anchor=(0.0, 1.0), ncol=3)
    return {"id": "Fig A", "paths": savefig(fig, "fig_a_x1_rules"), "caption": CAPTION}
