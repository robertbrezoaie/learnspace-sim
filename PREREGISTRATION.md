# Pre-registration — LearnSpace simulation study

**Status:** DRAFT, written before any simulation code exists. It is finalised at milestone M2: config hashes and the commit SHA are filled in, then the file is committed **before** the full runs of EXP-P, EXP-F, EXP-X and EXP-S.

- Pre-registration commit SHA: *(filled at M2)*
- Date of the final version: *(filled at M2)*

## 1. Purpose

To validate the algorithmic behaviour of the LearnSpace adaptive gamification framework with synthetic learners. The framework has three components: the adaptive decision model, the decision-specific Explanation Layer, and the Thompson-sampling feedback bandit. **The study makes no claims about learning outcomes, motivation or trust of real learners.**

## 2. Research questions

- **RQ1 (explanations).** Do decision-specific explanations name causes that actually drive the decision, and do they stay stable under measurement noise, compared with the original global-argmax rule?
- **RQ2 (bandit).** Does the deployed Thompson-sampling allocator learn the better feedback type, how fast, and what can a field study of about 50 learners realistically detect?
- **RQ3 (pipeline).** How does the full closed loop behave compared with static gamification and with simpler variants?

## 3. Primary configuration

| Item | Value |
|---|---|
| Algorithm config | `configs/algorithm.default.json`, SHA-256: *(filled at M2)* |
| Learner config | `configs/learner.default.json`, SHA-256: *(filled at M2)* |
| Scenarios | `configs/scenarios.json`, SHA-256: *(filled at M2)*. Primary scenario: **S2 (expertise reversal)** |
| Experiment configs | `configs/experiments/*.json`, SHA-256 of each: *(filled at M2)* |
| Calibration result | `results/summary/calibration.json`, SHA-256: *(filled at M2)* |
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

## 8. Commitments

- Results that contradict K1–K4 are reported as they are.
- The algorithm and the primary configuration are not tuned after seeing results.
- Any change after this commit is logged in `DECISIONS.md` with its date and reason, and every affected experiment is re-run.
- All data are synthetic, and every output says so.
