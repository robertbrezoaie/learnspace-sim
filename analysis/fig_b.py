"""Fig B (RQ1, X2): ST_exact vs input noise, one line per delta_tie; TF vs delta_tie."""
import matplotlib.pyplot as plt
import pandas as pd

from common import FULL_WIDTH, OI, mean_ci, read, savefig, style

TIE_COLORS = {0.0: OI["black"], 0.1: OI["sky"], 0.2: OI["blue"], 0.3: OI["purple"]}

CAPTION = (
    "Stability of v2 reward explanations under measurement noise (synthetic learners; EXP-P cells C2 and B-TS, S2, seeds 1-5; "
    "20 noise draws per decision). (a) ST_exact: among noise draws that leave the decision category unchanged, the share with an "
    "identical factor set; one line per near-tie threshold delta_tie. (b) TF: share of v2 explanations naming two factors. "
    "Points: mean over runs; bands and whiskers: 95% t-intervals."
)


def make(num: dict, extra: dict) -> dict:
    style()
    x2 = read("explain/x2_stability.csv.gz")
    r = x2[x2.output == "reward"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(FULL_WIDTH, 5.5 / 2.54))
    for t in sorted(r.delta_tie.unique()):
        rows = [dict(sd=sd, **mean_ci(r[(r.delta_tie == t) & (r.noise_sd == sd)].ST_exact)) for sd in sorted(r.noise_sd.unique())]
        d = pd.DataFrame(rows)
        a.plot(d.sd, d["mean"], marker="o", ms=3, color=TIE_COLORS.get(t, OI["grey"]), label=f"delta_tie = {t:g}")
        a.fill_between(d.sd, d.ci_low, d.ci_high, color=TIE_COLORS.get(t, OI["grey"]), alpha=0.2, lw=0)
    a.set_xlabel("input noise sigma_n (normalised units)")
    a.set_ylabel("ST_exact (share of draws)")
    a.legend(frameon=False)
    a.text(0.02, 0.02, "(a)", transform=a.transAxes)
    tf = r[r.noise_sd == r.noise_sd.min()]
    rows = [dict(t=t, **mean_ci(tf[tf.delta_tie == t].TF)) for t in sorted(tf.delta_tie.unique())]
    d = pd.DataFrame(rows)
    b.errorbar(d.t, d["mean"], yerr=[d["mean"] - d.ci_low, d.ci_high - d["mean"]], marker="o", ms=3, color=OI["blue"], capsize=2, lw=1)
    b.set_xlabel("near-tie threshold delta_tie")
    b.set_ylabel("TF (share of two-factor explanations)")
    b.text(0.02, 0.92, "(b)", transform=b.transAxes)
    return {"id": "Fig B", "paths": savefig(fig, "fig_b_x2_stability"), "caption": CAPTION}
