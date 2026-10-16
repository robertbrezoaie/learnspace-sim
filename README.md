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
| `results/summary/paper_numbers.json` | `analysis/numbers.py` |
| `results/summary/RESULTS.md` | `analysis/make_all.py` |

*(A table mapping each figure to its command is added at milestone M3.)*

## Citation

See `CITATION.cff`. The release that matches the submitted paper is tagged `v1.0`.

## Licence

MIT
