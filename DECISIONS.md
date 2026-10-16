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

## Calibration changes (EXP-CAL)

| Date | Parameter | Old → new | Reason (target missed) |
|---|---|---|---|
| | | | |

## Pre-registration and freeze

- Pre-registration commit SHA: *(filled at M2)*
- Changes after the freeze: *(each with date, reason and the experiments that were re-run)*
