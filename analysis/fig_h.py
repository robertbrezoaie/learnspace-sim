"""Fig H: the activity matrix. (a) 100 learners x 200 planned task slots; (b) share of slot states per week."""
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch

from common import FULL_WIDTH, SLOT_STATES, activity_matrix, savefig, style

CELL, SCENARIO, SEEDS, S, T = "B-TS", "S2", [1, 2, 3, 4, 5], 20, 10

CAPTION = (
    "Activity matrix of synthetic learners (EXP-P condition C4: DDA-E with the deployed Thompson-sampling bandit, scenario S2). "
    "Each learner has 20 weekly sessions x 10 planned tasks = 200 slots. (a) 100 learners from seed 1, chosen by a fixed rule "
    "(all 500 sorted by tasks completed, every 5th kept), most active at the top; each cell is one planned task slot. "
    "(b) Share of slot states per week over all 2,500 logged learners (seeds 1-5). After a wrong first answer (or \"don't know\") "
    "the bandit chooses the feedback type and the learner retries once. Three consecutive absences end participation (churn)."
)


def make(num: dict, extra: dict) -> dict:
    style()
    cmap = ListedColormap([c for _, _, c in SLOT_STATES])
    mats = [activity_matrix(CELL, SCENARIO, s, S, T) for s in SEEDS]

    m1 = mats[0]
    done = np.isin(m1, [0, 1, 2, 3]).sum(axis=1)
    order = np.argsort(-done, kind="stable")[::5][:100]

    fig = plt.figure(figsize=(FULL_WIDTH, 11.5 / 2.54))
    gs = fig.add_gridspec(2, 1, height_ratios=[2.2, 1], hspace=0.35)
    a = fig.add_subplot(gs[0])
    a.imshow(m1[order], aspect="auto", cmap=cmap, vmin=-0.5, vmax=len(SLOT_STATES) - 0.5, interpolation="nearest")
    for k in range(1, S):
        a.axvline(k * T - 0.5, color="white", lw=0.4)
    a.set_xticks(np.arange(S) * T + T / 2 - 0.5, [str(k) for k in range(1, S + 1)])
    a.set_xlabel("weekly session (10 planned task slots each)")
    a.set_ylabel("learner (sorted by tasks completed)")
    a.set_yticks([0, 49, 99], ["1", "50", "100"])
    a.spines[["left", "bottom"]].set_visible(False)
    a.tick_params(length=0)
    a.text(-0.09, 1.02, "(a)", transform=a.transAxes)

    b = fig.add_subplot(gs[1])
    allm = np.concatenate(mats).reshape(-1, S, T)
    shares = np.stack([(allm == i).mean(axis=(0, 2)) for i in range(len(SLOT_STATES))])
    bottom = np.zeros(S)
    x = np.arange(1, S + 1)
    for i, (_, _, color) in enumerate(SLOT_STATES):
        b.bar(x, shares[i], bottom=bottom, color=color, width=0.85, lw=0)
        bottom += shares[i]
    b.set_xlim(0.4, S + 0.6)
    b.set_ylim(0, 1)
    b.set_xticks(x)
    b.set_xlabel("weekly session")
    b.set_ylabel("share of slots")
    b.text(-0.09, 1.04, "(b)", transform=b.transAxes)

    fig.legend(handles=[Patch(color=c, label=l) for _, l, c in SLOT_STATES], loc="lower center", ncol=4, frameon=False,
               bbox_to_anchor=(0.5, -0.06), fontsize=7)
    return {"id": "Fig H", "paths": savefig(fig, "fig_h_activity_matrix"), "caption": CAPTION}
