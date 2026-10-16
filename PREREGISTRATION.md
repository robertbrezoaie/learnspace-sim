# Pre-registration — LearnSpace simulation study

**Status:** FINAL (milestone M2). Committed **before** the full runs of EXP-P, EXP-F, EXP-X and EXP-S.

- Pre-registration commit SHA: the commit that adds this final version; its SHA is recorded in `DECISIONS.md` (a file cannot contain its own commit hash).
- Date of the final version: 16 October 2026
- Code at pre-registration: the algorithm core (`src/core/**`) and the primary configs below are frozen from this commit on.

## 1. Purpose

To validate the algorithmic behaviour of the LearnSpace adaptive gamification framework with synthetic learners. The framework has three components: the adaptive decision model, the decision-specific Explanation Layer, and the Thompson-sampling feedback bandit. **The study makes no claims about learning outcomes, motivation or trust of real learners.**

## 2. Research questions

- **RQ1 (explanations).** Do decision-specific explanations name causes that actually drive the decision, and do they stay stable under measurement noise, compared with the original global-argmax rule?
- **RQ2 (bandit).** Does the deployed Thompson-sampling allocator learn the better feedback type, how fast, and what can a field study of about 50 learners realistically detect?
- **RQ3 (pipeline).** How does the full closed loop behave compared with static gamification and with simpler variants?

## 3. Primary configuration

| Item | Value |
|---|---|
| Algorithm config | `configs/algorithm.default.json`, SHA-256: `d5a98ef956aec761682e5539643a9490caccf609f4c8104b5335d009a046a9ac` |
| Learner config | `configs/learner.default.json`, SHA-256: `c654db13a2d837f33a417242163350c86e6a31df7b1cdf920309939fb515742c` |
| Scenarios | `configs/scenarios.json`, SHA-256: `3b7087b8567f890dd231f3d83fb6af7244bb45650521011b4cf7bac15f101c1c`. Primary scenario: **S2 (expertise reversal)** |
| Experiment configs | `cal.json` `4e784405601a71fb0e92292374369b395f83d6b09898db6782694f0ec76c997b`; `explain.json` `8881a911ac1eecfb17c5df45bc8bcc4bc71a80b56a0cbeec140e9e9b023d221d`; `field.json` `de85ba0df29b594ee8f1acce9cf71af5660a633d0c40739a96d2ed0b58dbae6a`; `pipeline.json` `975a8bd8f7584ca4862cdb922d0c1c10a6467d42cb879fecf8ce28a89ab0c64e`; `sensitivity.json` `9b205c6b54132e6c837a17a4c5cde0ee175dece527292d6d0c164bf9fd3c0b4c` |
| Calibration result | `results/summary/calibration.json`, SHA-256: `b20f8ec6b1f04ee9ef37a0ea411d4acedf68021bcdf3bbfe36a65aa5c85e7902`. All enforced plausibility targets met with default parameters; no calibration changes. Warmup tier target 0.90 unreachable (maximum 0.894), largest reachable value used. |
| Difficulty rule | DDA-E: the paper's Eq. 4 with R2's clip (engagement change only) |
| Explanation rule | v2, decision-specific, with δ_tie = 0.2. Comparators: v1 (original global argmax) and a random-factor baseline |
| Bandit | Deployed allocator: Beta(1, 1) priors, one global state, RANDOM_SHARE = 0.5 |
| Replication | EXP-P: N = 500 learners, 20 weekly sessions, 10 planned tasks per session, seeds 1–30. EXP-F: 500 runs per cell |

## 4. Conditions

Pipeline view (RQ3), scenario S2:

| ID | Difficulty | Feedback |
|---|---|---|
| C1 | STATIC | PLAIN |
| C2 | DDA-E | PLAIN |
| C3 | DDA-E | RANDOM |
| C4 | DDA-E | TS_DEPLOYED |
| C5 | DDA-E | ORACLE (upper bound) |

Bandit view (RQ2), scenarios S0–S3: PLAIN (C2), RANDOM, FIXED_HINT, FIXED_EXAMPLE, TS_DEPLOYED, TS_PURE, TS_CTX and ORACLE, all with DDA-E.

Field replica (RQ2): one session of 12 questions, tier order W W H E H E H E H E H E, TS_DEPLOYED with logged propensities, N ∈ {30, 50, 100}, scenarios S0–S3.

## 5. Metrics

Definitions are in `SIMULATION_SPEC.md` §10:

- explanations: NC, SI, DN, SU, AGR, ST_exact, ST_jaccard, TF, XR;
- bandit: REG_oracle, REG_fixed, VAL, PBEST, T95, ID90, FID90;
- pipeline: TIB, FAS, RTS, TASKS, CHURN, QUIT, E_mean, FRUS, BORE, Δθ.

## 6. Expected results

A result **holds** when the seed-paired mean difference has the predicted sign and its 95% t-interval excludes 0.

| ID | Expected result | Experiment |
|---|---|---|
| K1 | On reward decisions, deletion necessity (DN) is higher for v2 than for v1. | EXP-X1 |
| K2 | At input noise σ_n = 0.10, ST_exact on reward decisions is higher with δ_tie = 0.2 than with δ_tie = 0. | EXP-X2 |
| K3 | In S1 and S2, the final REG_fixed of TS_DEPLOYED is lower than that of RANDOM. | EXP-P, bandit view |
| K4 | Retry success (RTS) is higher in C4 than in C3. | EXP-P, pipeline view |

**Descriptive results, with no prediction:**

- how often v1 names a non-contributing factor for difficulty decisions (NC);
- C2 vs C1 on TIB, FRUS and BORE;
- TS_CTX vs TS_DEPLOYED in S2;
- false identification (FID90) in S0;
- Δθ across conditions;
- ID90 vs N in the field replica.

## 7. Analysis plan

- The unit of replication is the run. Average over learners within a run, then report the mean over seeds with a 95% t-interval.
- Compare conditions with seed-paired differences (common random numbers). Report effect sizes with intervals, and no p-values.
- Field replica: proportions over 500 runs, with Wilson 95% intervals.
- Robustness: K1–K4 are re-evaluated in every one-at-a-time sensitivity setting (EXP-S), and the paper reports in how many settings each holds.
- K1 and K2 use the 10 explanation-audit runs (cells C2 and B-TS × seeds 1–5), paired within run. K3 holds only if it holds in both S1 and S2. K4 uses the 30 seed-paired runs of C4 and C3 in S2.
- X3 (weight sweep) uses cell C2 only, 10,000 sampled reward decisions and 20 noise draws per decision.

## 7a. Disclosure

Before this commit, development runs with `--quick` (N = 100, 3 seeds; never used for the paper) were executed and inspected, as the build specification requires before the main runs. They suggested that K2 may not hold. K1–K4 above are unchanged from the draft written before any code existed.

## 8. Commitments

- Results that contradict K1–K4 are reported as they are.
- The algorithm and the primary configuration are not tuned after seeing results.
- Any change after this commit is logged in `DECISIONS.md` with its date and reason, and every affected experiment is re-run.
- All data are synthetic, and every output says so.
