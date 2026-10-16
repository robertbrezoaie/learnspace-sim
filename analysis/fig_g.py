"""Fig G (robustness, appendix): tornado plots of the C4 - C3 RTS difference and the C2 - C1 TIB difference across EXP-S settings."""
import matplotlib.pyplot as plt
import numpy as np

from common import FULL_WIDTH, OI, savefig, style

CAPTION = (
    "One-at-a-time sensitivity analysis (synthetic learners; N = 300, 10 seeds per setting). Each row is one learner parameter "
    "set to the low (left marker) and high (right marker) end of its range, all others at default. (a) seed-paired difference "
    "in retry success RTS between C4 (bandit) and C3 (random feedback), scenario S2; (b) seed-paired difference in time in band "
    "TIB between C2 (DDA-E) and C1 (static). The vertical line is the default setting."
)


def panel(ax, sk, col, label):
    default = float(sk.loc[sk.setting == "default", col].iloc[0])
    params = sk[sk.setting != "default"].param.unique()
    spans = []
    for p in params:
        lo = sk[(sk.param == p) & (sk.level == "low")][col].iloc[0]
        hi = sk[(sk.param == p) & (sk.level == "high")][col].iloc[0]
        spans.append((p, lo, hi, max(abs(lo - default), abs(hi - default))))
    spans.sort(key=lambda s: s[3])
    for i, (p, lo, hi, _) in enumerate(spans):
        ax.plot([lo, hi], [i, i], color=OI["grey"], lw=3, solid_capstyle="butt")
        ax.plot([lo], [i], marker="<", color=OI["blue"], ms=4)
        ax.plot([hi], [i], marker=">", color=OI["vermillion"], ms=4)
    ax.axvline(default, color=OI["black"], lw=0.8)
    ax.axvline(0, color=OI["black"], lw=0.5, ls=":")
    ax.set_yticks(np.arange(len(spans)), [s[0] for s in spans])
    ax.set_xlabel(label)


def make(num: dict, extra: dict) -> dict:
    style()
    sk = extra["sensitivity_k"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(FULL_WIDTH, 10.0 / 2.54))
    panel(a, sk, "K4", "(a) RTS difference, C4 - C3 (share)")
    panel(b, sk, "TIB_C2_minus_C1", "(b) TIB difference, C2 - C1 (share)")
    a.plot([], [], marker="<", color=OI["blue"], ls="", label="low end of range")
    a.plot([], [], marker=">", color=OI["vermillion"], ls="", label="high end of range")
    a.legend(frameon=False, loc="lower right", fontsize=6.5)
    fig.tight_layout(w_pad=2)
    return {"id": "Fig G", "paths": savefig(fig, "fig_g_tornado"), "caption": CAPTION}
