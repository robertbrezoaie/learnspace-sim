"""Fig D (RQ2): cumulative regret against the best fixed arm (REG_fixed) in S1 and S2."""
import matplotlib.pyplot as plt
import pandas as pd

from common import ARM_CELL, CONDITION_STYLE, FULL_WIDTH, mean_ci, read, savefig, style

CAPTION = (
    "Cumulative regret against the best fixed feedback arm in hindsight (REG_fixed) over the run's feedback decisions "
    "(synthetic learners; EXP-P, N = 500, 20 sessions, 30 seeds). (a) S1, homogeneous gains; (b) S2, expertise reversal. "
    "Lines: mean over seeds; bands: 95% t-intervals. Curves stop at the smallest number of decisions across seeds."
)

CELLS = ["B-TS", "B-TSPURE", "B-TSCTX", "B-RANDOM"]


def make(num: dict, extra: dict) -> dict:
    style()
    cur = read("pipeline/bandit_curves.csv.gz")
    fig, axes = plt.subplots(1, 2, figsize=(FULL_WIDTH, 6.0 / 2.54), sharey=False)
    for ax, sc, tag in zip(axes, ["S1", "S2"], ["(a) S1", "(b) S2"]):
        best = num["bandit"][sc]["best_fixed_arm"]
        cells = CELLS + ([ARM_CELL[best]] if best else [])
        d = cur[cur.scenario == sc]
        for cell in cells:
            dc = d[d.cell == cell]
            if dc.empty:
                continue
            maxd = dc.groupby("seed").decision.max().min()
            rows = [dict(decision=k, **mean_ci(g.REG_fixed)) for k, g in dc[dc.decision <= maxd].groupby("decision")]
            r = pd.DataFrame(rows)
            st = CONDITION_STYLE[cell]
            label = st["label"] + (" (best fixed arm)" if cell == ARM_CELL.get(best) else "")
            ax.plot(r.decision, r["mean"], color=st["color"], ls=st["ls"], lw=1.2, label=label)
            ax.fill_between(r.decision, r.ci_low, r.ci_high, color=st["color"], alpha=0.2, lw=0)
        ax.set_xlabel("feedback decisions (count)")
        ax.set_ylabel("REG_fixed (cumulative, probability units)")
        ax.text(0.02, 0.92, tag, transform=ax.transAxes)
    axes[1].legend(frameon=False, loc="upper left", bbox_to_anchor=(0.0, 0.88))
    return {"id": "Fig D", "paths": savefig(fig, "fig_d_regret"), "caption": CAPTION}
