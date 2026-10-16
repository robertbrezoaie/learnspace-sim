# CLAUDE.md — learnspace-sim

This repository holds the simulation study for the revision of the MDPI *Algorithms* manuscript algorithms-4525172 (LearnSpace). Researcher: Robert-Emanuel Brezoaie.

## Read first, in this order

1. `SIMULATION_SPEC.md`: the full build specification and the source of truth.
2. `DECISIONS.md`: decisions already taken. Log every new ambiguity and its resolution here.
3. `configs/`: every parameter value. The values are authoritative.

## Rules

This is a summary of spec §2; if the two ever differ, the spec wins.

- **English only:** code, identifiers, comments, commit messages, configs, logs, generated text, figures and all documents.
- **Deterministic:** no `Math.random`, `Date.now` or `crypto` in simulation code paths. Use only the seeded, named RNG streams of spec §5.
- **Pure, portable core:** `src/core/**` does no I/O, uses no Node-only APIs, never imports from `src/sim/**`, and receives its RNG as a parameter.
- **Information barrier:** only the ORACLE policy and the metric code may read hidden learner state, through `src/sim/oracle.ts`.
- **Deployed bandit:** the bandit reproduces the deployed study-page allocator (spec §6.8). If the study-page repository is available (ask the researcher for its path), copy `lib/beta.ts` and `lib/allocator.ts` from it and change only how the RNG is injected.
- **Configs only:** parameters come only from `configs/*.json`. Keys starting with `_` are documentation, and code ignores them. If a config value and the spec disagree, stop and ask the researcher.
- **No hand-written numbers:** every reported number comes from `results/summary/paper_numbers.json`.
- **Locked design:** do not change the decisions in spec §3, the model in spec §6–7, or the expected results in spec §13 without asking the researcher.
- **Freeze line:** after the pre-registration commit (milestone M2), `src/core/**` and the primary configs are frozen. A bug fix needs a `DECISIONS.md` entry and a full re-run of every affected experiment.
- **Scope:** do not add features the spec does not ask for.

## How to work

- Work one milestone at a time (spec §15). At the end of each milestone:
  1. run `npm test`;
  2. summarise what was built;
  3. list open questions;
  4. stop for the researcher's review.
- Write each test together with the code it tests (spec §14).
- Keep code simple and readable. The researcher must be able to explain every line to reviewers.
- Commit at least once per milestone, with a clear message.
- When something in the spec is ambiguous, choose the simplest deterministic option that logs more data, and record the choice in `DECISIONS.md`.

## Commands (spec §4.3)

```
npm test
npm run sim -- --exp cal | pipeline | field | explain | sensitivity [--quick]
npm run sim:all
python analysis/make_all.py
npm run all
```

## Milestones

Work through the milestones of spec §15 in order. If work falls behind, follow the cut order in spec §15. Never cut EXP-CAL, the pre-registration or the tests.
