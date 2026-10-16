"""Fig F (RQ3): pipeline view in S2: TIB, FAS, RTS and CHURN for C1-C5."""
import matplotlib.pyplot as plt
import numpy as np

from common import CONDITION_STYLE, FULL_WIDTH, PIPELINE_VIEW, savefig, style

CAPTION = (
    "Pipeline view in scenario S2 (synthetic learners; N = 500, 20 weekly sessions, 30 seeds). C1: static difficulty, plain "
    "feedback; C2: DDA-E, plain feedback; C3: DDA-E, random feedback type; C4: DDA-E, deployed Thompson-sampling bandit; "
    "C5: DDA-E, oracle feedback (upper bound). TIB: share of first attempts with true success probability in [0.55, 0.85]; "
    "FAS: observed first-attempt success; RTS: observed retry success; CHURN: share of learners who churned. "
    "Points: mean over seeds; whiskers: 95% t-intervals."
)

METRICS = [("TIB", "TIB (share of tasks)"), ("FAS", "FAS (share)"), ("RTS", "RTS (share)"), ("CHURN", "CHURN (share of learners)")]


def make(num: dict, extra: dict) -> dict:
    style()
    fig, axes = plt.subplots(1, 4, figsize=(FULL_WIDTH, 5.0 / 2.54))
    conds = list(PIPELINE_VIEW)
    for ax, (m, label) in zip(axes, METRICS):
        for i, c in enumerate(conds):
            d = num["pipeline"][c][m]
            st = CONDITION_STYLE[PIPELINE_VIEW[c]]
            ax.errorbar([i], [d["mean"]], yerr=[[d["mean"] - d["ci_low"]], [d["ci_high"] - d["mean"]]], marker="o", ms=4,
                        color=st["color"], capsize=2, lw=1)
        ax.set_xticks(np.arange(len(conds)), conds)
        ax.set_xlim(-0.6, len(conds) - 0.4)
        ax.set_ylabel(label)
    fig.tight_layout(w_pad=1.2)
    return {"id": "Fig F", "paths": savefig(fig, "fig_f_pipeline"), "caption": CAPTION}
