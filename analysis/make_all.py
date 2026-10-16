"""Runs the whole analysis: paper_numbers.json, Tables 1-3, Figs A-G and RESULTS.md.

Usage: python analysis/make_all.py [--quick]
All data are synthetic (simulated learners).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fig_a, fig_b, fig_c, fig_d, fig_e, fig_f, fig_g, fig_h  # noqa: E402,E401
import paper_numbers  # noqa: E402
import tables  # noqa: E402
from common import SUMMARY, exists  # noqa: E402


def main() -> None:
    num, extra = paper_numbers.compute()
    flat = paper_numbers.write(num)
    print(f"paper_numbers.json: {len(flat)} numbers")

    figs = []
    plan = [(fig_a, "explain/x1_rules.csv.gz"), (fig_b, "explain/x2_stability.csv.gz"), (fig_c, "explain/x3_weights.csv.gz"),
            (fig_d, "pipeline/bandit_curves.csv.gz"), (fig_e, "field/runs.csv.gz"), (fig_f, "pipeline/learners.csv.gz"),
            (fig_g, "sensitivity/runs.csv.gz"), (fig_h, "pipeline/tasks_B-TS_S2_s1.csv.gz")]
    for mod, need in plan:
        if exists(need):
            f = mod.make(num, extra)
            figs.append(f)
            print(f"{f['id']}: {', '.join(f['paths'])}")
        else:
            print(f"skipped {mod.__name__}: missing {need}")

    tabs = [tables.table1()]
    if "pipeline" in num:
        tabs.append(tables.table2(num))
    if "robustness" in num:
        tabs.append(tables.table3(num))
    print(f"tables: {len(tabs)}")

    import results_md  # noqa: E402

    results_md.write(num, flat, figs, tabs)
    print(f"RESULTS.md written to {SUMMARY / 'RESULTS.md'}")


if __name__ == "__main__":
    main()
