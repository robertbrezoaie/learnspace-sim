"""Fig C (RQ1, X3, appendix): reward weight sweep over the simplex; TF and ST_exact (delta_tie = 0.2)."""
import matplotlib.pyplot as plt
import numpy as np

from common import FULL_WIDTH, OI, ROOT, load_json, read, savefig, style

CAPTION = (
    "Reward weight sweep (synthetic learners; EXP-P cell C2, S2; 10,000 sampled reward decisions; delta_tie = 0.2). Each square is "
    "one weight vector (alpha, beta) with gamma = 1 - alpha - beta, on a grid of step 0.1. (a) TF: share of two-factor explanations; "
    "(b) ST_exact at sigma_n = 0.10. The cross marks the default weights (0.4, 0.4, 0.2)."
)


def make(num: dict, extra: dict) -> dict:
    style()
    x3 = read("explain/x3_weights.csv.gz")
    d = x3[np.isclose(x3.delta_tie, 0.2)]
    algo = load_json(ROOT / "configs" / "algorithm.default.json")["reward"]
    fig, axes = plt.subplots(1, 2, figsize=(FULL_WIDTH, 7.0 / 2.54))
    for ax, metric, label in zip(axes, ["TF", "ST_exact"], ["(a) TF", "(b) ST_exact"]):
        sc = ax.scatter(d.alpha, d.beta, c=d[metric], marker="s", s=120, cmap="viridis", vmin=d[metric].min(), vmax=d[metric].max())
        ax.plot([algo["alpha"]], [algo["beta"]], marker="x", color=OI["vermillion"], ms=8, mew=1.5)
        ax.set_xlabel("alpha (mastery weight)")
        ax.set_ylabel("beta (response-behaviour weight)")
        ax.set_xlim(-0.08, 1.08)
        ax.set_ylim(-0.08, 1.08)
        ax.set_aspect("equal")
        cb = fig.colorbar(sc, ax=ax, shrink=0.8)
        cb.set_label(label)
    return {"id": "Fig C", "paths": savefig(fig, "fig_c_x3_weights"), "caption": CAPTION}
