# learnspace-sim

Simulation study of the LearnSpace adaptive gamification framework. It accompanies the manuscript *"An Interpretable Hybrid Adaptive Gamification Framework with Bandit-Based Feedback Selection and Decision-Specific Learner-Facing Explanations: Design and Simulation Study"* (MDPI *Algorithms*, under revision).

> **All data produced by this repository are synthetic.** The simulation validates algorithmic behaviour, not learning outcomes.

## What is in here

- `src/core/`: the algorithm under test. It contains:
  - the adaptive decision model (reward modulation and difficulty adjustment);
  - the decision-specific Explanation Layer;
  - the Thompson-sampling feedback bandit, as deployed in the LearnSpace study page.

  The core is pure TypeScript with no I/O, so it can be reused in other runtimes.
- `src/sim/`: synthetic learners and the closed-loop simulation engine.
- `src/experiments/`: the five experiments (calibration, pipeline grid, field-study replica, explanation audit, sensitivity analysis).
- `analysis/`: Python scripts that produce every table, figure and number reported in the paper.
- `configs/`: every parameter, with its source or a "stylised" label.
- `PREREGISTRATION.md`: research questions, expected results and the analysis plan, committed before the main runs.
- `DECISIONS.md`: every modelling and implementation decision, with dates.

The LearnSpace prototype (Expo/React Native and Supabase) is not part of this repository. Its code is available from the corresponding author on reasonable request.

## Reproduce

Requirements: Node 20 or newer, and Python 3.11 or newer.

```
npm install
pip install -r analysis/requirements.txt
npm test
npm run all        # runs all experiments, then all analysis scripts
```

| Output | Produced by |
|---|---|
| `figures/` | `analysis/fig_*.py` |
| `results/summary/paper_numbers.json` | `analysis/paper_numbers.py` |
| `results/summary/RESULTS.md` | `analysis/make_all.py` |

| Figure / table | Content | Data from | Script |
|---|---|---|---|
| `figures/fig_a_x1_rules` | X1: v1 vs v2 vs random explanation rules (RQ1) | `npm run sim -- --exp explain` | `analysis/fig_a.py` |
| `figures/fig_b_x2_stability` | X2: stability under input noise, two-factor rate (RQ1) | `--exp explain` | `analysis/fig_b.py` |
| `figures/fig_c_x3_weights` | X3: reward weight sweep (appendix) | `--exp explain` | `analysis/fig_c.py` |
| `figures/fig_d_regret` | REG_fixed curves in S1 and S2 (RQ2) | `--exp pipeline` | `analysis/fig_d.py` |
| `figures/fig_e_field` | Field replica: ID90 and FID90 vs N (RQ2) | `--exp field` | `analysis/fig_e.py` |
| `figures/fig_f_pipeline` | Pipeline view C1–C5 in S2 (RQ3) | `--exp pipeline` | `analysis/fig_f.py` |
| `figures/fig_g_tornado` | Sensitivity tornado plots (appendix) | `--exp sensitivity` | `analysis/fig_g.py` |
| `results/summary/table1_parameters.*` | Parameter table from the configs | configs | `analysis/tables.py` |
| `results/summary/table2a_pipeline.*`, `table2b_bandit.*` | Main results with 95% CIs | `--exp pipeline` | `analysis/tables.py` |
| `results/summary/table3_robustness.*` | K1–K4 across sensitivity settings | `--exp sensitivity` | `analysis/tables.py` |
| `results/summary/example_cases.json` | Three real explanation cases (X5) | `--exp explain` | `src/experiments/audit_lib.ts` |
| `results/summary/calibration.json` | Field-tier calibration and plausibility checks | `--exp cal` | `src/experiments/cal.ts` |

`analysis/make_all.py --quick` analyses the development runs in `results/quick/` instead; their outputs are never used for the paper.

## Citation

See `CITATION.cff`. The release that matches the submitted paper is tagged `v1.0`.

## Licence

MIT
