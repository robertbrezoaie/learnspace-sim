# Decisions log

Every decision that affects the simulation is recorded here with its date, what was decided and why. Newest entries go at the bottom of each section.

## Decisions taken before the build (by the researcher)

| Date | ID | Decision | Why |
|---|---|---|---|
| 2026-10-15 | D4 | No biometric or physiological inputs anywhere; the avatar photo upload is removed from the paper. | K-12 privacy concerns. |
| 2026-10-15 | D5 | Learner-model parameters come from published values where they exist. Where they don't, they are labelled "stylised" and swept in EXP-S. | Defends against the "simulation encodes your assumptions" objection. |
| 2026-10-15 | — | One public repository for the simulation, including the algorithm core, with a tagged release v1.0. The LearnSpace prototype is available on request. | Reproducibility. |
| 2026-10-16 | D1 | The core and the simulator are written in TypeScript (Node). Analysis and figures are in Python, reading CSV. | The core must be shareable with the Edge Function and the study page, which are TypeScript. |
| 2026-10-16 | D2 | The α input (formerly `userProfile`) is estimated mastery: smoothed accuracy over the last N_u first attempts. Learning styles are removed. | Observable and free of personal data. Learning styles are widely criticised in education research. |
| 2026-10-16 | D3 | The contextual bandit appears only as an ablation (`TS_CTX`), labelled as a future extension. | The paper's bandit is the deployed, non-contextual one. |
| 2026-10-16 | D6 | Difficulty follows the paper's Eq. 4 with R2's clip (`DDA-E`): it uses engagement change only. No performance term is added. | Keeps the published formula with an explicit clip. The explanation is made output-specific. |
| 2026-10-16 | D7 | The β input (formerly `biometricData`) is response time relative to the learner's own baseline. "Retries" and "hint use" are not used. | In this design, the system controls retries and feedback; they are not learner behaviour. |
| 2026-10-16 | — | Everything in the repository is in English. | The paper and the public repository are in English. |

## Decisions taken during the build

| Date | Milestone | What | Why |
|---|---|---|---|
| 2026-10-16 | M0 | `src/core/bandit/beta.ts` and `allocator.ts` are copied from the study-page repository (`lib/`, commit `bf3472e4701f9b1d3062220f1ac1eeb3b6bec4b8`, clean tree). Only changes: `Rng` is an object with `next()` (`rng()` → `rng.next()`), the `secureRandom` defaults are removed, and imports use explicit `.ts` paths. | Spec §6.8 and CLAUDE.md. Explicit `.ts` paths let the core run unchanged in Deno. |
| 2026-10-16 | M0 | The deployed Beta sampler keeps its own Marsaglia polar normal; the simulator RNG's Box–Muller `normal()` (spec §5.1) is used only by the learner model. The deployed `sampleGamma` requires shape ≥ 1 (always true for Beta(1, 1) priors); the simulator's `gamma()` also handles shape < 1. | The bandit must be the deployed code. |
| 2026-10-16 | M0 | The deployed code has only the `probs` mode and updates the posterior in SQL (`update_bandit`). `src/core/bandit/thompson.ts` adds `updatePosterior` (a += r, b += 1 − r), the `sample` mode (one Beta draw per arm, argmax, random tie-break, same loop as `estimateThompsonProbs`) and `chooseArm`. `probs` mode calls the deployed `allocate()` unchanged, so its RNG order is the deployed one (Thompson probabilities first, then the half, then the arm). | Keeps the copied files identical; spec §6.8 asks for both modes. |
| 2026-10-16 | M0 | b uses the sample standard deviation (n − 1) of the baseline log response times, floored at `rt_sd_floor`. | Spec §6.2 says only "sd"; B_min = 5 makes n − 1 safe. |
| 2026-10-16 | M0 | Ties: v1's argmax and v2's sort by \|c_j\| keep the fixed order u, b, e. | Deterministic; spec does not specify. |
| 2026-10-16 | M0 | SI for a primary factor that is not an input of the output (v1 naming u or b for a difficulty decision): its contribution counts as 0, so SI = 0; the error is counted by NC. | NC and SI then measure different things, without double counting. |
| 2026-10-16 | M0 | The DDA-E step contribution is computed as D_base(s) · (e_now − e_used for the previous task). Within a session this equals D_base(s) · (e_{t−1} − e_{t−2}) of spec §6.5 exactly. | One explicit rule that cannot drift from the D actually used. |
| 2026-10-16 | M0 | The `Rng` interface is defined in `src/core/types.ts`; `src/sim/rng.ts` implements it. `next()` has 32-bit resolution (xoshiro128** output / 2³²). Box–Muller and gamma use 1 − U to avoid log(0). | The core may not import from `src/sim`. |
| 2026-10-16 | M0 | The ORACLE policy will live in `src/sim/oracle.ts` itself, so `src/sim/policies.ts` never imports `oracle.ts`; test 8 checks this. Test 8 also checks that `src/core` has no non-relative imports, `Math.random`, `Date`, `crypto` or `process`. | Makes the information barrier checkable at file level. |
| 2026-10-16 | M0 | Explanation metrics (NC, SI, DN, SU, Jaccard) live in `src/sim/explainMetrics.ts`, not in the frozen core. | They are evaluation code, not part of the algorithm. |
| 2026-10-16 | M0 | `npm test` runs `tsc --noEmit` before Vitest. | The information barrier is also enforced by types (spec §2.2). |
| 2026-10-16 | M1 | Learner ids are 0-based. Every per-learner random draw (attempt, retry, "don't know", response time, grader) is always consumed, even when its result is not needed; the quit draw is consumed only when quitting is possible (not after the last planned task). | Keeps the k-th event of a learner on the same random numbers in every condition (common random numbers, spec §5.2). |
| 2026-10-16 | M1 | The retry "don't know" draw uses the same q_dk as the first attempt of that task. | Spec §7.2 writes Bernoulli(q_dk) for both. |
| 2026-10-16 | M1 | Weekly engagement recovery E += ρ_s(E* − E) is applied once at the start of every week s ≥ 2 to every non-churned learner, before the attendance draw. | "Once per elapsed week" (spec §7.5); attendance then uses the recovered E. |
| 2026-10-16 | M1 | `band_shift` (EXP-S) shifts only the learner's flow band [band_lo, band_hi]; p_bore and the TIB band are not shifted. | Spec §7.7: the TIB metric always uses the default band. |
| 2026-10-16 | M1 | Task row t holds the difficulty decision that set D_t (with `v1_factor_diff` = the v1 factor at the decision point after task t − 1) and the reward decision made after task t. Extra logged columns: `half`, `retryDontKnow`, `e_prev`, `e_prev2` (the two e values of the step, needed by X2), `quit`, `h_correct`, `h_retryCorrect`. A per-run summary file `runs.csv.gz` is added to EXP-P. | One row per decision point; logs more data (CLAUDE.md). |
| 2026-10-16 | M1 | The random-explanation baseline draws from stream `xrandom` only for decisions that v2 explains. | Spec §6.6: all three rules are evaluated on the decisions v2 explains. |
| 2026-10-16 | M1 | TS_CTX uses u computed from the learner's observations before the current task (the time of the mistake). | Spec §6.8. |
| 2026-10-16 | M1 | Extra named streams: `snapshot` (probsTS snapshots), `pbest` (field P_best), `xaudit:*` (EXP-X sampling), `xnoise:*` and `xnoise3:*` (EXP-X noise). | Separate streams so that measurement never changes the simulated runs. |
| 2026-10-16 | M1 | In S0 all arms have identical π, so there is no best fixed arm: `best_fixed_arm` is empty, REG_fixed = 0 and T95 is not defined. T95 is read from the snapshots (resolution 100 decisions). | Avoids reporting an arbitrary "best" arm. |
| 2026-10-16 | M1 | E_mean = mean of E after each task; FRUS counts each time the unrecovered-mistake streak reaches 3; BORE counts each time a run of tasks with true P > p_bore reaches 5 (runs continue across sessions). QUIT = quits / sessions attended. | Spec §10.3 gives the episode definitions only. |
| 2026-10-16 | M1 | EXP-CAL tier success is the analytic expectation (1 − q_dk)·P per learner at E = E*, averaged over 100,000 learners; bisection on δ ∈ [−8, 8]. The warmup target 0.90 is unreachable (maximum 0.894 because of slip and "don't know"), so the warmup tier aims at the maximum minus the bisection tolerance and records it. The two field-replica targets marked "about" are reported, not enforced. | Spec §9.1. |
| 2026-10-16 | M1 | Field replica: learners arrive in an order shuffled with stream `week:1:order`; the policy receives the same observable context as in EXP-P. | Spec §9.3 does not fix the order. |
| 2026-10-16 | M1 | No TypeScript constructor parameter properties are used. | Node 25 worker threads strip types natively and reject them; the code then also runs without a loader. |
| 2026-10-16 | M3 | `analysis/numbers.py` is named `analysis/paper_numbers.py`. | A file named `numbers.py` shadows the Python standard library module that numpy imports. |
| 2026-10-16 | M3 | The local analysis environment is Python 3.9.6 with versions pinned in `analysis/requirements.txt` that support 3.9 and 3.11. | Spec §4.1 asks for 3.11+; only 3.9 is installed. Results do not depend on the Python version. |
| 2026-10-16 | M2 | K1 and K2 are evaluated on the 10 audit runs (cells C2 and B-TS × seeds 1–5), paired within run; per-cell values are also reported. In EXP-S, on C2 seeds 1–3. | The unit of replication is the run (spec §12.1); both cells are audit inputs (spec §9.4). |
| 2026-10-16 | M2 | X3 uses cell C2 only, 10,000 reward rows sampled from all decisions (explained or not, because XR depends on the weights), 20 noise draws per row, the same draws for every weight point. X2 for difficulty decisions reports only the category-change share (`configs/experiments/explain.json`). | Keeps EXP-X within the runtime budget. |
| 2026-10-16 | M2 | Quick development runs (N = 100, 3 seeds) were inspected before the pre-registration commit, as spec §14 requires. They suggested that K2 may not hold: the two-factor rule adds a second boundary (ratio 1 − δ_tie) at which the factor set can change. K1–K4 were not changed. | Transparency; the spec forbids changing expected results without the researcher. |

## Calibration changes (EXP-CAL)

| Date | Parameter | Old → new | Reason (target missed) |
|---|---|---|---|
| 2026-10-16 | — | no change | All enforced plausibility targets were met with the default parameters at the first iteration (`results/summary/calibration.json`). |

## Pre-registration and freeze

- Pre-registration commit SHA: `f0c695469c28404253aa70694249e3043c3e8fec` (16 October 2026). From this commit on, `src/core/**` and the primary configs are frozen.
- Changes after the freeze (none to `src/core/**` or the primary configs):
  - 2026-10-16: `src/sim/jobs.ts` (audit job, not the frozen core) computed the X5 seed inside a filter, which was quadratic in the number of task rows and stalled the full EXP-X run. Fixed; outputs unchanged. EXP-X and EXP-S were run after the fix; EXP-P and EXP-F were not affected.
  - 2026-10-16: the dirty-tree check (`src/sim/meta.ts`) now ignores generated outputs under `results/` and `figures/`, because EXP-X writes `results/summary/example_cases.json` before EXP-S starts. Source, configs and documents still count.
