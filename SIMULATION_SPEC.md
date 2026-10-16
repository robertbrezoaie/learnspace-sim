# LearnSpace Simulation Study — Build Specification

**File name in the repo:** `SIMULATION_SPEC.md`
**Project:** Revision of the MDPI *Algorithms* manuscript algorithms-4525172 (LearnSpace PhD research, NUST POLITEHNICA Bucharest)
**Researcher:** Robert-Emanuel Brezoaie
**Version:** 1.0, 16 October 2026
**Audience:** the coding agent (Claude Code) that builds and runs the simulator, and the researcher who reviews it

---

## 0. How to use this document

1. Read the whole document before writing code. Section 2 lists rules that must never be broken.
2. Build in the order of the milestones in section 15. M0–M3 are required for the paper, M4 is strongly recommended, and M5 is optional.
3. Do not add features that are not in this document. When something is ambiguous, choose the simplest option that keeps runs deterministic and logs more data, then record the choice in `DECISIONS.md` (date, what, why).
4. Never write a number into a results file by hand. Every number the paper reports must come out of a script in this repo (section 12.4).
5. Section 3 lists the modelling decisions the researcher has taken. Do not change them.
6. The researcher supplies these files together with this spec: `CLAUDE.md`, `DECISIONS.md` (already seeded), a draft `PREREGISTRATION.md`, `README.md`, `CITATION.cff`, `LICENSE`, `.gitignore` and every file in `configs/`. The config values are authoritative. Keys starting with `_` are documentation, and code ignores them. If a config value contradicts this spec, stop and ask the researcher.

---

## 1. Purpose and scope

### 1.1 What the simulation is for

The revised paper presents an interpretable hybrid adaptive gamification framework with three algorithmic components:

1. an **adaptive decision model** (reward modulation and dynamic difficulty adjustment, DDA) built from explicit weighted contributions;
2. a **decision-specific, learner-facing Explanation Layer** that explains each adaptive decision using only that decision's own contributions;
3. a **Bayesian multi-armed bandit** (Thompson sampling) that learns which feedback type to give after a mistake. This is the same bandit that is deployed on the Report 5 study page.

This repository validates the **algorithmic behaviour** of these components with synthetic learners. It does **not** measure learning outcomes, motivation or trust of real learners. The paper will say: *"The simulation validates algorithmic behaviour, not learning outcomes."*

### 1.2 Issues it answers

| Issue | Answered by |
|---|---|
| No learning (AI) component | The bandit learns from outcomes: regret and convergence (EXP-P bandit view, EXP-F) |
| No validation of any kind | The whole repository |
| The explanation is not tied to the output it explains | Per-output rule vs the original rule (EXP-X1) |
| Undefined scales, normalisation and bounds | Formal model in section 6, implemented and unit-tested |
| Arbitrary weights α, β, γ | Weight-grid sweep (EXP-X3) |
| No code or versioned artefacts | Public repo, fixed seeds, one command reproduces everything |

### 1.3 Research questions (they will appear in the paper)

- **RQ1 (explanations).** Do decision-specific explanations name causes that actually drive the decision (fidelity), and do they stay stable under measurement noise, compared with the original global-argmax rule?
- **RQ2 (bandit).** Does the deployed Thompson-sampling allocator learn the better feedback type, how fast, and what can a field study of about 50 learners realistically detect?
- **RQ3 (pipeline).** How does the full closed loop (adaptive rules + explanations + bandit) behave compared with static gamification and with simpler variants?

### 1.4 Methodological framing

In Design Science Research terms, this is an artificial evaluation of a designed artefact (Venable et al., 2016). Simulated learners can end up encoding the modeller's own assumptions (Doroudi et al., 2019). The design guards against this in four ways:

- (a) its main results compare algorithm variants on identical simulated inputs;
- (b) it includes a null scenario in which no feedback type is better;
- (c) parameters are fixed and pre-registered before the main runs (section 13);
- (d) a sensitivity analysis covers every learner parameter (EXP-S).

---

## 2. Non-negotiable rules

1. **Determinism.** The same config and seed must give byte-identical outputs. Simulation code paths never use `Math.random`, `Date.now()` or `crypto`. All randomness comes from the seeded RNG in `src/sim/rng.ts` and is passed in explicitly.
2. **Information barrier.** The algorithm (`src/core/**`) and every feedback policy except `ORACLE` see only observable data (`Observation`, section 6.1). They never see hidden learner state: ability θ, engagement E, true probabilities or arm gains. This is enforced by types and by a test (section 14).
3. **The core is pure and portable.** `src/core/**` has no I/O, no Node-only APIs, no global state, and no randomness except through an injected `Rng`. It must be copyable as-is into a Supabase Edge Function (Deno) and into the Next.js study page.
4. **The bandit is the deployed bandit.** `src/core/bandit/**` reproduces the study-page allocator (Report 5 Part B, §8) exactly. The only change is that the RNG is injected (section 6.8).
5. **No magic numbers.** Every parameter lives in a JSON config entry that states its source, or says "stylised" (section 7.7). Code reads parameters only from config objects.
6. **No hand-written results.** Every number reported in the paper comes from `results/summary/paper_numbers.json`, which the `analysis/` scripts generate.
7. **Freeze line.** After the pre-registration commit (section 13), the primary configs and `src/core/**` do not change. A bug fix is allowed only with a `DECISIONS.md` entry and a full re-run of every affected experiment.
8. **Synthetic data is labelled as such.** Every summary file and every caption draft says the data are synthetic.
9. **English only.** Everything in this repository is in English: code, identifiers, comments, commit messages, configs, logs, generated text, figures, `README.md`, `DECISIONS.md`, `PREREGISTRATION.md` and `RESULTS.md`.

---

## 3. Decisions

**Taken by the researcher:**

| ID | Decision |
|---|---|
| D1 | The core and the simulator are written in TypeScript (Node). Analysis and figures are written in Python and read the CSV outputs. |
| D2 | The α input (formerly `userProfile`) is the learner's estimated mastery: recent accuracy, defined in section 6.2. Learning styles are removed. |
| D3 | The contextual bandit appears only as an ablation (`TS_CTX`), labelled as a future extension. The paper's bandit is the deployed, non-contextual one. |
| D4 | There are no biometric or physiological inputs anywhere. |
| D5 | Learner-model parameters come from published values where they exist. Where they don't, they are labelled "stylised" and swept in EXP-S. |
| D6 | Difficulty follows the paper's Eq. 4 with R2's clip (`DDA-E`, section 6.5): it uses engagement change only. No performance term is added. |
| D7 | The β input (formerly `biometricData`) is response behaviour: response time relative to the learner's own baseline. "Retries" and "hint use" are not used, because in this design the system controls both, not the learner. |

---

## 4. Stack, repository layout and commands

### 4.1 Stack

| Part | Choice |
|---|---|
| Language | TypeScript (strict, ESM), Node 20 LTS or newer |
| Runner | `tsx` for scripts; `worker_threads` for parallel jobs |
| Tests | Vitest |
| TS dependencies | No runtime dependencies beyond Node built-ins (`zlib`, `fs`, `worker_threads`). Dev only: `typescript`, `tsx`, `vitest`, `@types/node` |
| Analysis | Python 3.11+, `numpy`, `pandas`, `scipy`, `matplotlib`, with exact versions pinned in `analysis/requirements.txt` |
| Output formats | gzipped CSV (`.csv.gz`) for data, JSON for metadata |
| Licence | MIT, plus `CITATION.cff` |

### 4.2 Repository layout

```
learnspace-sim/
  SIMULATION_SPEC.md          # this file
  CLAUDE.md                   # working rules for the coding agent (supplied)
  PREREGISTRATION.md          # supplied as a draft; finalised at M2 (section 13)
  DECISIONS.md                # supplied, seeded with D1–D7
  README.md                   # supplied skeleton; figure table added at M3
  CITATION.cff  LICENSE  .gitignore        # supplied
  package.json  tsconfig.json  vitest.config.ts
  configs/
    algorithm.default.json    # section 6.9
    learner.default.json      # section 7.7
    scenarios.json            # section 7.4
    experiments/              # one JSON per experiment (section 9)
  src/
    core/                     # the algorithm under test: pure and portable
      types.ts
      signals.ts              # u, b, e
      gamification.ts         # XP (Eq. 1)
      reward.ts               # aiReward and multiplier (Eq. 3)
      difficulty.ts           # STATIC and DDA-E (Eq. 4 with R2's clip)
      explain.ts              # v2 per-output rule, v1 legacy rule, random baseline
      templates.ts            # English text fragments
      bandit/
        beta.ts               # Gamma (Marsaglia–Tsang) and Beta sampling
        allocator.ts          # deployed allocator (Part B §8)
        contextual.ts         # TS_CTX ablation
    sim/
      rng.ts                  # seeded PRNG and distributions
      population.ts           # hidden learner traits
      learner.ts              # hidden learner model (section 7)
      curriculum.ts           # base difficulty; field-study tier sequence
      policies.ts             # feedback policies (section 8.3)
      oracle.ts               # hidden-state view for ORACLE and metrics only
      engine.ts               # closed loop (section 8)
      log.ts                  # gzipped CSV writers
    experiments/
      cal.ts  pipeline.ts  field.ts  explain_audit.ts  sensitivity.ts
    cli.ts
  analysis/
    requirements.txt
    common.py                 # loading, confidence intervals, palette, style
    fig_*.py  tables.py  numbers.py  make_all.py
  results/                    # raw/ and quick/ are git-ignored; summary/ is committed
  figures/                    # committed (PDF + PNG)
  tests/
```

### 4.3 Commands

```
npm test                                   # all unit and integration tests
npm run sim -- --exp cal                   # calibration (M1)
npm run sim -- --exp pipeline [--quick]    # EXP-P
npm run sim -- --exp field [--quick]       # EXP-F
npm run sim -- --exp explain               # EXP-X (needs EXP-P raw logs)
npm run sim -- --exp sensitivity           # EXP-S
npm run sim:all                            # all of the above, in order
python analysis/make_all.py                # tables, figures, paper_numbers.json, RESULTS.md
npm run all                                # sim:all, then analysis
```

`--quick` runs with N = 100 learners and 3 seeds. It is for development only: quick outputs go to `results/quick/` and are never used for the paper.

**Runtime budget:** `npm run all` should finish in under 60 minutes on an 8-core laptop. Print progress and an ETA.

---

## 5. Randomness and reproducibility

### 5.1 RNG

- Implement `xoshiro128**` (32-bit state), seeded through `splitmix32` from a 32-bit hash (FNV-1a or truncated cyrb53) of a stream name.
- API:
  - `next()`: uniform on [0, 1);
  - `normal()`: Box–Muller, with no cached second value, so every call consumes exactly two uniforms;
  - `lognormal(mu, sigma)`, `bernoulli(p)`;
  - `gamma(shape)`: Marsaglia–Tsang; for shape < 1 use `gamma(shape + 1) · U^(1/shape)`;
  - `beta(a, b)` = X / (X + Y), with X ~ Gamma(a) and Y ~ Gamma(b);
  - `categorical(probs)`, `shuffle(array)` (Fisher–Yates).

### 5.2 Named streams and common random numbers

Each purpose gets its own stream, named `"{seed}|{purpose}"`:

| Stream | Used for |
|---|---|
| `pop` | hidden learner traits (θ₀, speed, trait engagement) |
| `learner:{i}:attend` | weekly attendance of learner i |
| `week:{s}:order` | order of learners within week s |
| `learner:{i}:attempt` | first-attempt correctness |
| `learner:{i}:retry` | retry correctness |
| `learner:{i}:rt` | response times |
| `learner:{i}:dk` | "don't know" events |
| `learner:{i}:quit` | quitting within a session |
| `learner:{i}:grader` | grader-error flips |
| `policy` | feedback-policy randomness (random half, Thompson draws) |
| `xrandom` | the random-explanation baseline |

With a given seed, every condition gets the same population and the same random numbers for the k-th event of each learner. This is the technique of common random numbers (Law, 2015). Comparisons between conditions are therefore paired by seed (section 12.1).

### 5.3 Run metadata

Every experiment writes `results/raw/<exp>/run_meta.json` with:

- the git commit SHA. Refuse to run if the working tree is dirty, unless `--allow-dirty` is given; outputs from such a run are marked non-publishable;
- the SHA-256 of every config file used;
- the seeds;
- the Node version;
- start and end times and wall-clock duration.

---

## 6. The algorithm under test (`src/core`)

All quantities are per learner. A **task** is one question or exercise. On each task the learner makes a first attempt and, after a mistake, one retry with feedback. The index t counts tasks over the learner's whole history, and s indexes weekly sessions.

### 6.1 Observations (the only data the algorithm may use)

```ts
type Arm = 'plain' | 'hint' | 'example';

interface Observation {
  session: number;
  taskInSession: number;
  plannedTasks: number;
  difficulty: number;            // D used for this task
  firstCorrect: boolean;         // observed (graded) result: score >= 2
  dontKnow: boolean;
  rtSeconds: number;
  arm: Arm | null;               // feedback given after a mistake, otherwise null
  retryCorrect: boolean | null;
  retryDontKnow: boolean | null;
}
// Activity slots for e: one entry per planned task slot (section 6.2)
```

### 6.2 Input signals

All signals are computed after task t is complete, including its retry, from observations 1..t. Every signal lies in [−1, 1], and 0 means "neutral / no evidence".

**u: mastery (the α input, replacing `userProfile`).**

```
window = last N_u first attempts            (dontKnow counts as incorrect)
k = number correct in window, n = |window|
m_hat = (k + 1) / (n + 2)                   # Laplace smoothing; n = 0 gives 0.5
u = 2 · m_hat − 1
```

**b: response behaviour (the β input, replacing `biometricData`).** Uses only first attempts that were not "don't know".

```
x_j = ln(rtSeconds_j)
recent   = last N_b such attempts
baseline = all earlier such attempts
if |baseline| < B_min:  b = 0
else:
    z_j = (x_j − mean(baseline)) / max(sd(baseline), 0.05)    for j in recent
    b = clip(−mean(z) / 2, −1, 1)           # faster than own baseline → positive
```

Use prefix sums so this is O(1) per task.

**e: engagement change (the γ input).** e is computed from an activity series a, with one value per *planned* task slot:

| Slot outcome | a |
|---|---|
| attempted (not "don't know") | 1 |
| first attempt answered "don't know" | 0.5 |
| planned but not done, because the learner quit the session | 0 |
| absent session | T slots of 0, appended when the learner next attends, before that session's first task |

```
S, L = EWMAs of a with half-lives H_s and H_l (in slots); both start at 1
λ(H) = 1 − 2^(−1/H)
S ← S + λ(H_s) · (a − S);   L ← L + λ(H_l) · (a − L)
if number of slots < E_min:  e = 0
else:  e = clip((S − L) / max(L, 0.1), −1, 1)
```

After missed-week slots are appended, recompute all signals. The difficulty of the session's first task uses these recomputed signals.

### 6.3 Gamification (Eq. 1, per task)

```
XP_t = round((baseXP + difficultyMultiplier · D_t) · m_t)    if firstCorrect or retryCorrect
XP_t = 0                                                     otherwise
```

The social term of Eq. 1 is omitted because the simulation has no social interaction. XP is logged but not evaluated.

### 6.4 Reward modulation (Eq. 3, typed and bounded)

```
contributions_reward = { u: α·u,  b: β·b,  e: γ·e }        # α, β, γ ≥ 0 and α + β + γ = 1
aiReward = α·u + β·b + γ·e                                  # ∈ [−1, 1]
m = clip(1 + λ_r · aiReward, m_min, m_max)                  # reward multiplier
decision value used for explanations: Δ_reward = aiReward
```

Simulated learners do not react to XP or to m, because no credible parameters exist for that effect. Reward decisions are therefore evaluated only with the explanation metrics (section 10.1).

### 6.5 Difficulty

The difficulty level is D ∈ [D_min, D_max] = [1, 5]. Its logit, δ(D) = s_D · (D − 3), is used only by the learner model.

The curriculum base for session s of S is `D_base(s) = 2 + 2 · (s − 1) / (S − 1)`, which rises from 2 to 4 over the semester.

| Rule | Difficulty of task t | Contribution to the step (used for explanations) |
|---|---|---|
| `STATIC` | D_t = D_base(s) | none (never explained) |
| `DDA-E` (paper Eq. 4 with R2's clip) | D_t = clip(D_base(s) · (1 + e_{t−1}), D_min, D_max) | { e: D_base(s) · (e_{t−1} − e_{t−2}) } |

Rules for DDA-E:

- `e_{t−1}` is the engagement-change signal after the previous task. Before a learner's first task, all signals are 0.
- The difficulty decision has a single input, e. Its explanation therefore always names engagement change, with its direction. This is the correction R3 asked for: the original rule could name u (α) or b (β) for a decision that depends only on e (γ).
- **Planned step** = the contribution above (unclipped). **Realized step** = D_t − D_{t−1}, after clipping.
- Difficulty decisions are explained only **within a session**. The first task of a session follows a curriculum change, so it is not an adaptive decision and is never explained.
- If |planned step| ≥ ε_D but |realized step| < ε_D because of clipping, log `suppressed_by_clip = true` and give no explanation.

### 6.6 Explanation Layer

**v2: decision-specific rule (the revised paper's rule).** It is called once per output (reward, difficulty) per task, with that output's own contributions only.

```
explain(output, c: {factor: number}, Δ, ε, δ_tie):
    if |Δ| < ε: return null                        # no material change: nothing shown
    dir = sign(Δ)
    S = factors j with sign(c_j) == dir and c_j ≠ 0, sorted by |c_j| descending
    assert S is not empty                          # always true when Δ = Σ c_j ≠ 0
    F = [S[0]]
    if |S| ≥ 2 and |c_S[1]| ≥ (1 − δ_tie) · |c_S[0]|:
        F = [S[0], S[1]]                           # near tie → two-factor explanation
    share_j = |c_j| / Σ_{k ∈ S} |c_k|   for j in F
    return { output, direction: dir, factors: F, shares, text }
```

For the reward output, Δ = aiReward and ε = ε_r. For difficulty, Δ = the planned step and ε = ε_D; the realized step decides suppression (section 6.5).

**v1: the original rule (paper §3.4, Step 5), kept for comparison only.**

```
dominant = argmax over {u, b, e} of |c_reward_j|    # one factor per task
use `dominant` as the explanation of every adaptive decision of that task (reward and difficulty)
no ε, no tie handling, no sign check
```

v1 is evaluated on the revised inputs (u, b, e); only the explanation rule differs.

**Random baseline.** One factor chosen uniformly from the output's own factors with c_j ≠ 0, using stream `xrandom`.

Metrics for all three rules are computed on the same decisions: those that v2 explains (|Δ| ≥ ε and not suppressed by clipping).

### 6.7 Explanation text templates

**Sentence frames:**

| Output, direction | Frame |
|---|---|
| difficulty, up | The next tasks are a little harder because {reasons}. |
| difficulty, down | The next tasks are a little easier because {reasons}. |
| reward, up | You earned extra XP because {reasons}. |
| reward, down | Your XP bonus is smaller this time because {reasons}. |

**Reason fragments** (by factor and the sign of its contribution). Two factors are joined with " and ".

| Factor | Positive contribution | Negative contribution |
|---|---|---|
| e | you have been more active lately | you have been less active lately |
| u | your mastery of the topic keeps growing | the topic is still new for you |
| b | you are working more fluently than usual | the last questions took you longer than usual |

Whether reward decreases are shown to learners is a LearnSpace UX decision. The simulator generates and logs them either way. The bandit's choice is never explained with a reason: only the type of feedback is shown.

### 6.8 Feedback bandit (the deployed allocator, Report 5 Part B §8)

- **Arms:** `plain`, `hint`, `example`.
- **State:** one Beta(a, b) per arm, starting at (1, 1). There is **one global state shared by all learners in a run**, as deployed.
- **Reward:** 1 if the observed retry is correct (score ≥ 2), otherwise 0. A "don't know" on the retry gives 0.
- **Allocation, once per mistake:**

```
half = rng.next() < RANDOM_SHARE ? 'random' : 'thompson'
if half == 'random':
    arm = uniform over the three arms
else if ts_mode == 'sample':
    draw θ_k ~ Beta(a_k, b_k) for each arm; arm = argmax (ties broken at random)
else (ts_mode == 'probs'):
    probsTS = Monte Carlo estimate over `draws` samples, exactly as in Part B
    arm ~ categorical(probsTS)
propensities[k] = RANDOM_SHARE / 3 + (1 − RANDOM_SHARE) · probsTS[k]     # 'probs' mode only
```

  `sample` and `probs` give the same arm distribution. Long runs use `sample` for speed; the field replica uses `probs`, because it needs the propensities. A test checks that the two modes agree (section 14).
- **Update** after every graded retry, from both halves: a += r, b += 1 − r.
- **Source of the code.** If the study-page repository is available, copy its `lib/beta.ts` and `lib/allocator.ts` into `src/core/bandit/`. Refactor only to inject the RNG (replace `secureRandom()` with `rng.next()`), keep everything else identical, and record the source commit SHA in a header comment. Otherwise implement from this section.
- **`TS_CTX` (ablation only).** As above, but with separate Beta states per context: `novice` if u < 0 at the time of the mistake, `advanced` otherwise.

### 6.9 Algorithm parameters (`configs/algorithm.default.json`)

| Parameter | Default | Meaning |
|---|---|---|
| N_u | 10 | mastery window (first attempts) |
| N_b, B_min | 5, 5 | response-behaviour window; minimum baseline size |
| H_s, H_l, E_min | 5, 30, 10 | engagement EWMA half-lives (slots); cold-start slots |
| α, β, γ | 0.4, 0.4, 0.2 | reward weights (the paper's pseudocode values) |
| λ_r, m_min, m_max, ε_r | 0.5, 0.75, 1.5, 0.10 | reward multiplier and its explanation threshold |
| baseXP, difficultyMultiplier | 10, 2.0 | Eq. 1 |
| D_min, D_max | 1, 5 | difficulty bounds (R2's clip) |
| ε_D | 0.10 | difficulty explanation threshold (levels) |
| δ_tie | 0.2 | near-tie threshold for two-factor explanations |
| RANDOM_SHARE, prior, draws | 0.5, Beta(1, 1), 5000 | deployed bandit settings |

---

## 7. Learner model (`src/sim/learner.ts`)

The learner model is hidden from the algorithm; it only produces observations.

### 7.1 Hidden traits (drawn once per learner, from stream `pop`)

- θ₀ ~ N(μ_θ, σ_θ²): ability on the logit scale (Rasch convention).
- μ_rt ~ N(ln 40, 0.3²): personal baseline of log response time (seconds).
- E* ~ Beta(9·m_E, 9·(1 − m_E)) with m_E = 0.667: trait engagement.

Dynamic state: ability θ_t, engagement E_t (starting at E*), the current streak of unrecovered mistakes, the number of consecutive absences, and a churned flag.

### 7.2 One task

Given difficulty D (logit δ = s_D(D − 3)), ability θ and engagement E:

```
P = g + (1 − g − s) · σ(θ − δ)                       # true first-attempt success probability
q_dk = clip(dk0 + dk1·(1 − E) + dk2·(1 − P), 0, 0.6)
dontKnow ~ Bernoulli(q_dk)                                           [learner:i:dk]
correct = dontKnow ? false : Bernoulli(P)                            [learner:i:attempt]
ln rt ~ N(μ_rt + λ_d·(δ − θ), σ_rt²);  if dontKnow: rt = 0.5 · rt    [learner:i:rt]
observedCorrect = dontKnow ? false : correct XOR Bernoulli(grader_error)   [learner:i:grader]

if not observedCorrect:
    arm = feedbackPolicy.choose(observable context)
    x = θ − δ                                                    # relative expertise
    π_a = g + (1 − g − s) · σ(θ − δ + gain_a(x))   for every arm # true retry success; logged
    retryDontKnow ~ Bernoulli(q_dk)                                  [learner:i:dk]
    retryCorrect = retryDontKnow ? false : Bernoulli(π_arm)          [learner:i:retry]
    observedRetry = retryDontKnow ? false : retryCorrect XOR Bernoulli(grader_error)
    feedbackPolicy.update(arm, observedRetry)
```

σ is the logistic function, and gain_plain = 0 in every scenario.

### 7.3 Learning

```
if not dontKnow:  θ += ℓ_p       # practice
if retryCorrect:  θ += ℓ_r       # successful correction after feedback
```

### 7.4 Feedback scenarios (`configs/scenarios.json`)

Gains are in logits and depend on relative expertise x = θ − δ. This models the expertise-reversal effect: worked examples help more when the material is hard for the learner, hints more when it is within reach. Each gain is clipped to [−0.5, 1.5], then multiplied by `gain_scale` (default 1).

| Scenario | gain_hint(x) | gain_example(x) | Purpose |
|---|---|---|---|
| S0 null | 0 | 0 | No real difference: the bandit must not invent a winner. |
| S1 homogeneous | 0.4 | 0.8 | One clearly better arm. |
| **S2 expertise reversal (primary)** | 0.5 + 0.2x | 0.8 − 0.4x | The best arm depends on the learner and the task. |
| S3 small effect | 0.15 | 0.25 | Hard to detect. |

Anchor: the average feedback effect is d ≈ 0.48 (Wisniewski et al., 2020), which is about 0.87 logits using the conversion logit ≈ d·π/√3 (Chinn, 2000). The expertise-reversal effect is from Kalyuga et al. (2003). The values above are stylised within that range and swept through `gain_scale`.

### 7.5 Engagement, quitting and attendance

After each task (after its retry), using **observed** outcomes, i.e. what the learner was told:

```
E += ρ · (E* − E)
if observedCorrect:
    streak = 0
    if band_lo ≤ P ≤ band_hi:  E += φ_flow             # challenge fits
    elif P > p_bore:           E −= φ_bore             # too easy
else if observedRetry:
    streak = 0;  E −= φ_frus / 3                       # mistake recovered with help
else:
    streak += 1; E −= φ_frus · (1 + 0.5 · (streak − 1))   # unrecovered mistakes accumulate
E = clip(E, 0, 1)

if this is not the last planned task:
    quit with probability q = q_max · max(0, (E_q − E) / E_q)       [learner:i:quit]
```

- **Between weeks:** `E += ρ_s · (E* − E)` once per elapsed week.
- **Attendance:** each week the learner attends with probability `clip(a0 + a1·E, 0, 0.98)` [stream `learner:i:attend`].
- **Churn:** after `absences_to_churn` consecutive absences, the learner churns and never returns.

### 7.6 What the learner model does not include

No reaction to XP, rewards, badges or explanations; no social effects; no forgetting; no LLM. Section 16 lists these as limitations.

### 7.7 Learner parameters (`configs/learner.default.json`)

Each entry has the form `{ "value": ..., "range": [low, high], "source": "..." }`. EXP-S uses `range`.

| Parameter | Default | Range (EXP-S) | Source / status |
|---|---|---|---|
| μ_θ, σ_θ | 0, 1.0 | σ_θ: 0.7–1.3 | Rasch convention (Embretson & Reise, 2000) |
| s_D | 1.0 logit per level | 0.75–1.25 | design choice: D ∈ [1, 5] spans ±2 logits |
| g (guess) | 0.05 | 0.02–0.15 | BKT guess bound (Baker et al., 2008); low for open answers |
| s (slip) | 0.05 | 0.02–0.10 | BKT slip bound (Baker et al., 2008; Corbett & Anderson, 1994) |
| ℓ_p | 0.006 | 0.003–0.012 | stylised; checked in EXP-CAL |
| ℓ_r | 0.015 | 0.005–0.030 | stylised; checked in EXP-CAL |
| σ_rt | 0.4 | 0.3–0.6 | lognormal response-time model (van der Linden, 2006); value stylised |
| λ_d | 0.25 | 0.10–0.40 | same model: harder relative to ability → slower; value stylised |
| dk0, dk1, dk2 | 0.02, 0.10, 0.10 | all scaled ×0.5 to ×1.5 (`dk_scale`) | stylised |
| m_E (mean of E*) | 0.667 | 0.55–0.75 | stylised |
| ρ, ρ_s | 0.05, 0.3 | 0.02–0.10; 0.1–0.5 | stylised |
| φ_flow, φ_bore, φ_frus | 0.02, 0.015, 0.03 | 0.01–0.04; 0.005–0.03; 0.015–0.06 | direction from affect dynamics (D'Mello & Graesser, 2012; Baker et al., 2010); magnitudes stylised |
| band_lo, band_hi, p_bore | 0.55, 0.85, 0.90 | learner's band shifted by ±0.05 (the TIB metric always uses the default band) | target challenge band; upper bound near the 85% rule (Wilson et al., 2019) |
| E_q, q_max | 0.35, 0.25 | q_max: 0.10–0.40 | stylised |
| a0, a1, absences_to_churn | 0.6, 0.5, 3 | — | stylised |
| grader_error | 0 | 0–0.10 | LLM grader disagreement; Report 5 H1 targets κ ≥ 0.60 |
| gain_scale | 1.0 | 0.5–1.5 | section 7.4 |
| N, S, T | 500 learners, 20 weekly sessions, 10 planned tasks per session | — | one school semester |

---

## 8. Simulation engine (`src/sim/engine.ts`)

### 8.1 One run

```
population = drawPopulation(N, seed)              # identical across conditions for a given seed
policy = makeFeedbackPolicy(cell.policy, seed)    # holds the global bandit state
for s in 1..S:
    attendees = active learners who attend this week              [learner:i:attend]
    update absences and churn for the others
    shuffle(attendees)                                            [week:s:order]
    for i in attendees:  runSession(i, s)
compute per-learner metrics (section 10)
```

Learners run one after another within a week, and the bandit is updated immediately after each retry. Simultaneous classroom sessions (which would delay updates) are not modelled.

### 8.2 One session

```
append missed-week activity slots; apply weekly engagement recovery; recompute signals
for k in 1..T:
    D = difficultyRule.next(signals)                # STATIC or DDA-E (6.5)
    outcome = learner.doTask(D, feedbackPolicy)     # 7.2, 7.3
    learner.updateEngagement(outcome)               # 7.5
    append observation and activity slot
    signals = computeSignals(...)                   # 6.2
    reward decision and XP                          # 6.3, 6.4
    plan the next difficulty                        # 6.5
    explanations: v1, v2 (δ_tie), random            # 6.6
    log the task row (for the seeds listed in 11.1)
    if learner quits: append zero activity slots for the remaining planned tasks; break
```

### 8.3 Feedback policies (`src/sim/policies.ts`)

| Policy | Behaviour | Sees hidden state? |
|---|---|---|
| PLAIN | always `plain` | no |
| RANDOM | uniform over the 3 arms | no |
| FIXED_HINT, FIXED_EXAMPLE | always that arm | no |
| TS_DEPLOYED | section 6.8 with RANDOM_SHARE 0.5 | no |
| TS_PURE | section 6.8 with RANDOM_SHARE 0 | no |
| TS_CTX | section 6.8 with two contexts | no |
| ORACLE | argmax_a π_a for this mistake | **yes**, through `oracle.ts` only |

### 8.4 Information barrier

- `src/core/**` must not import anything from `src/sim/**`.
- Policies receive an `ObservableContext` (observations, signals, rng). Only ORACLE is constructed with an `OracleView` that exposes π_a. Metric code may use `OracleView`; no other policy may.

---

## 9. Experiments

Every experiment has a config in `configs/experiments/` and writes to `results/raw/<exp>/`.

### 9.1 EXP-CAL: calibration and plausibility checks (before the freeze)

1. **Field-study tiers.** Find δ_warmup, δ_easy and δ_hard by bisection, so that the mean first-attempt success over 100,000 learners from the default population (at E = E*, including "don't know") equals 0.90, 0.65 and 0.30. These are the design targets of the Report 5 question bank. Write the values to `results/summary/calibration.json`. If 0.90 cannot be reached, use the largest reachable value and record it.
2. **Static plausibility run.** Run STATIC + PLAIN in S2 with N = 2,000 and one seed. Report per session: mean first-attempt success, mean θ, attendance, mean tasks done and "don't know" rate. Also report final churn.

   **Plausibility targets:**
   - the median learner's success stays within 0.55–0.80 across sessions;
   - churn by session 20 is between 2% and 35%;
   - the "don't know" rate is 3–15%;
   - wrong first answers in the field replica are about 45%, i.e. about 5.4 per learner.

   If a target is missed, change only the directly responsible parameter: ℓ_p or ℓ_r for drift in success, q_max or a0 for churn, `dk_scale` for "don't know". Re-run and record every change in `DECISIONS.md`. After three iterations, stop and report to the researcher.

### 9.2 EXP-P: pipeline grid (the main experiment)

Settings: N = 500, S = 20, T = 10, seeds 1–30.

| Cell | Difficulty | Feedback policy | Scenarios |
|---|---|---|---|
| C1 | STATIC | PLAIN | S2 |
| C2 | DDA-E | PLAIN | S0–S3 (outcomes are identical across scenarios, but the regret reference differs) |
| B-RANDOM | DDA-E | RANDOM | S0–S3 |
| B-HINT, B-EXAMPLE | DDA-E | FIXED_HINT, FIXED_EXAMPLE | S0–S3 |
| B-TS | DDA-E | TS_DEPLOYED | S0–S3 |
| B-TSPURE | DDA-E | TS_PURE | S0–S3 |
| B-TSCTX | DDA-E | TS_CTX | S0–S3 |
| B-ORACLE | DDA-E | ORACLE | S0–S3 |

The paper uses two views of this grid:

- **Pipeline view (RQ3), in scenario S2:** C1, C2, C3 = B-RANDOM, C4 = B-TS, C5 = B-ORACLE.
- **Bandit view (RQ2):** all B-cells plus C2 (playing the role of FIXED_PLAIN), in S0–S3.

### 9.3 EXP-F: field-study replica

This replicates the Report 5 study page:

- one session per learner, 12 questions in the tier order W W H E H E H E H E H E, using the calibrated δ values;
- no gamification and no DDA; quitting is allowed;
- TS_DEPLOYED with `ts_mode = 'probs'` and `draws = 5000`, with propensities logged.

Grid: N ∈ {30, 50, 100} × S0–S3 × 500 runs (seeds 1–500). `--fast` uses `draws = 1000`, for development only.

Logged per run:

- every decision, with its propensities;
- the final posterior;
- P_best per arm (20,000 draws);
- the true best arm: the arm with the highest mean π over the run's decisions. In S0 all arms are equal, so there is none.

### 9.4 EXP-X: explanation audit (replay)

Inputs: the task logs of EXP-P cells C2 and B-TS (S2, seeds 1–5). Replay is valid without re-simulating, because reward decisions do not affect learners and the explanation rule affects nothing else. Sample at most 50,000 explained decisions per cell and output, with a fixed sampling seed.

- **X1, rule comparison:** v1 vs v2 (δ_tie = 0.2) vs random, per output, on NC, SI, DN, SU and AGR (section 10.1).
- **X2, stability:**
  - noise σ_n ∈ {0.05, 0.10, 0.20} added to the normalised inputs (u, b, e), then clipped to [−1, 1]. For difficulty decisions, perturb both e values (e_{t−1} and e_{t−2});
  - δ_tie ∈ {0, 0.1, 0.2, 0.3};
  - R = 20 noise draws per decision;
  - metrics: ST_exact, ST_jaccard, TF.
- **X3, weight sweep (reward only):** (α, β, γ) on the simplex grid with step 0.1 (66 points) × δ_tie ∈ {0, 0.2}. Metrics: TF, XR, ST_exact at σ_n = 0.10, and DN.
- **X4, exposure:** the number of v2 explanations a learner would see per session, by output.
- **X5, example cases.** Export three real cases from C2 (seed 1) to `results/summary/example_cases.json`, chosen by fixed rules:
  - (a) the first single-factor difficulty decrease;
  - (b) the first two-factor reward explanation;
  - (c) the first difficulty decision where v1 names a factor that does not contribute.

  Include the inputs, the contributions, both rules' outputs and the explanation text. These replace the paper's illustrative example in §3.5.

### 9.5 EXP-S: sensitivity analysis

One-at-a-time design: each parameter in section 7.7 that has a range is set to its low value and to its high value, with all others at default. For each setting:

- run C1, C2, C3 and C4 in S2, and B-RANDOM and B-TS in S1, with N = 300 and seeds 1–10;
- run X1, and X2 (σ_n = 0.10, δ_tie ∈ {0, 0.2}), on C2 seeds 1–3.

Evaluate the pre-registered expected results K1–K4 (section 13) in every setting. A result "holds" when the seed-paired mean difference has the predicted sign and its 95% CI excludes 0.

Optional (M5): a Latin hypercube of 50 joint samples over all ranged parameters, evaluated the same way.

---

## 10. Metrics

### 10.1 Explanation metrics (per explained decision, then averaged)

**Decision category:** `up` if Δ ≥ ε, `down` if Δ ≤ −ε, `none` otherwise. To **neutralise** a factor means to set its contribution to 0 and recompute the planned Δ. Decisions whose category was changed by clipping are excluded, and their number is reported.

| ID | Name | Definition |
|---|---|---|
| NC | non-contributing cause | The explanation names a factor that is not an input of this output. |
| SI | sign inconsistency | The primary factor's contribution has the opposite sign to Δ. |
| DN | deletion necessity | Neutralising the named factor(s) changes the category. |
| SU | sufficiency | Keeping only the named factor(s), with the others neutralised, keeps the category. |
| AGR | agreement | The v1 primary factor equals the v2 primary factor. |
| ST_exact | stability | Under input noise, among draws where the category is unchanged, the factor set is identical. |
| ST_jaccard | stability (soft) | Mean Jaccard similarity of the factor sets, over the same draws. |
| TF | two-factor rate | Share of v2 explanations that name two factors. |
| XR | explanation rate | Share of decisions with \|Δ\| ≥ ε. |

NC and SI are 0 for v2 by construction. Report them to diagnose the original rule, not as achievements of v2. DN, SU and the stability metrics are not guaranteed by construction; they are the main comparison.

Difficulty decisions have a single input (e), so for them v2's DN, SU and stability are also 1 by construction. The difficulty comparison is therefore about how often v1 names a factor that does not drive the decision (NC) and how often v1 and v2 agree (AGR). The multi-factor comparison (DN, SU, stability, near ties) is made on reward decisions, which have three inputs.

### 10.2 Bandit metrics

For each mistake, π_a are the true retry-success probabilities of all three arms (from `OracleView`).

| ID | Definition |
|---|---|
| REG_oracle | Cumulative Σ (max_a π_a − π_chosen) over the run's decisions. |
| REG_fixed | Cumulative Σ (π_{a*} − π_chosen), where a* is the arm with the highest Σ π over the run's decisions (the best fixed arm in hindsight). |
| VAL | Mean π_chosen (policy value). |
| PBEST(t) | probsTS of the best fixed arm, snapshotted every 100 decisions (TS policies only; 5000 draws). |
| T95 | First decision index at which PBEST ≥ 0.95 (censored if it never happens). |
| ID90 | Field replica: P_best of the true best arm is ≥ 0.9 at the end of the run. |
| FID90 | Field replica, S0: some arm has P_best ≥ 0.9 at the end (false identification). |

Curves are reported on a grid of decision indices (every 100), up to the smallest total number of decisions across that cell's seeds.

### 10.3 Pipeline metrics (per learner, then averaged per run)

| ID | Definition |
|---|---|
| TIB | Time in band: share of first attempts whose true P lies in the default band [0.55, 0.85]. |
| FAS | Observed first-attempt success rate. |
| RTS | Observed retry success rate. |
| TASKS | Tasks completed over the semester. |
| CHURN | The learner churned before session 20. |
| QUIT | Share of attended sessions ended early. |
| E_mean | Mean hidden engagement. |
| FRUS | Episodes of ≥ 3 unrecovered mistakes in a row. |
| BORE | Episodes of ≥ 5 consecutive tasks with true P > p_bore. |
| Δθ | θ_final − θ₀: simulated ability gain. Report it as secondary and label it as a model output. |

### 10.4 Optional (M5): field-study power for Report 5 H3

For each EXP-F run:

- estimate each arm's retry success with the Hájek inverse-propensity estimator, using the logged propensities;
- compute the contrast Δ_LLM = (π̂_hint + π̂_example) / 2 − π̂_plain, with a 95% CI from a cluster bootstrap over learners (B = 200).

Report, for N = 30, 50 and 100: the bias against the true contrast, the CI coverage, the power (CI lower bound > 0) in S1–S3, and the type-I error in S0.

Standard intervals can under-cover in adaptive experiments (Hadad et al., 2021). The 50% random share keeps every propensity ≥ 1/6, which bounds the weights. If Report 5 Part A specifies a different estimator, follow Part A.

---

## 11. Outputs and data dictionary

### 11.1 Files

| File | Rows | Written for |
|---|---|---|
| `results/raw/pipeline/learners.csv.gz` | one per learner × cell × scenario × seed | all seeds |
| `results/raw/pipeline/tasks_{cell}_{scenario}_s{seed}.csv.gz` | one per task | seeds 1–5 only |
| `results/raw/pipeline/bandit_curves.csv.gz` | one per cell × scenario × seed × grid point | all seeds |
| `results/raw/pipeline/bandit_snapshots.csv.gz` | posteriors and probsTS every 100 decisions | TS cells, all seeds |
| `results/raw/field/runs.csv.gz` | one per run | all runs |
| `results/raw/field/decisions.csv.gz` | one per decision, with propensities | all runs |
| `results/raw/explain/*.csv.gz` | one file per audit (X1–X4) | — |
| `results/raw/sensitivity/*.csv.gz` | per setting × cell × seed summaries | — |
| `results/summary/*` | aggregated tables, `calibration.json`, `paper_numbers.json`, `example_cases.json`, `RESULTS.md` | committed to git |

### 11.2 Task row (main columns)

`cell, scenario, seed, learner, session, task, D_base, D, clipped, suppressed_by_clip, firstCorrect_obs, dontKnow, rt, arm, retryCorrect_obs, u, b, e, c_u, c_b, c_e, aiReward, m, XP, c_e_diff, step_planned, step_realized, v2_reward_factors, v2_diff_factors, v1_factor, rand_reward_factor, rand_diff_factor`

Hidden columns, prefixed `h_`: `h_theta, h_E, h_P, h_pi_plain, h_pi_hint, h_pi_example`. They exist only for evaluation; nothing in `src/core` reads them.

### 11.3 Learner row

`cell, scenario, seed, learner, theta0, theta_final, Estar, E_mean, sessions_attended, churned, tasks, quits, FAS, RTS, TIB, FRUS, BORE, n_expl_reward, n_expl_diff, mistakes, regret_oracle_sum`

---

## 12. Analysis and figures (`analysis/`)

### 12.1 Statistics

- The unit of replication is the run (cell × scenario × seed). First average over learners within a run; then report the mean over seeds with a 95% t-interval.
- Compare conditions by seed-paired differences (common random numbers), with 95% t-intervals.
- Report effect sizes with intervals. Do not report p-values for simulation contrasts: with enough runs, any difference becomes "significant".
- Field replica: proportions over 500 runs, with Wilson 95% intervals.

### 12.2 Figure style

- Vector PDF plus a 600-dpi PNG. Width 16 cm (full width) or 8 cm (half width); fonts 8–9 pt.
- No titles inside figures (captions go in the paper). Every axis is labelled, with units.
- The colour-blind-safe Okabe–Ito palette, with one fixed colour per policy/condition in every figure:

  | Condition | Colour |
  |---|---|
  | STATIC | black |
  | C2 (DDA-E with PLAIN feedback) | sky blue |
  | RANDOM | orange |
  | FIXED arms | yellow (dashed for hint, dotted for example) |
  | TS_DEPLOYED | blue |
  | TS_PURE | bluish green |
  | TS_CTX | reddish purple |
  | ORACLE | vermillion |
- Uncertainty is shown as shaded 95% bands on curves and as whiskers on points.
- Caption drafts go in `RESULTS.md` and say "synthetic learners".

### 12.3 Figures and tables

| ID | Content | RQ | Placement |
|---|---|---|---|
| Fig A | X1: NC, SI, DN and SU for v1, v2 and random, with one panel per output (reward; difficulty) | RQ1 | main text |
| Fig B | X2: ST_exact vs σ_n, one line per δ_tie; a second panel shows TF vs δ_tie | RQ1 | main text |
| Fig C | X3: triangular heatmap over (α, β), with γ = 1 − α − β. Panel a shows TF, panel b ST_exact; the default weights are marked. | RQ1 | appendix |
| Fig D | REG_fixed curves in two panels (S1, S2), for TS_DEPLOYED, TS_PURE, TS_CTX, RANDOM and the best fixed arm | RQ2 | main text |
| Fig E | Field replica: ID90 (S1–S3) and FID90 (S0) vs N | RQ2 | main text |
| Fig F | Pipeline view: TIB, FAS, RTS and CHURN for C1, C2, C3, C4 and C5 | RQ3 | main text |
| Fig G | EXP-S: tornado plots of the C4 − C3 difference in RTS and the C2 − C1 difference in TIB | robustness | appendix |
| Table 1 | Parameter table generated from the configs (value, range, source) | — | main text |
| Table 2 | Main results with 95% CIs (pipeline view, and bandit view in S2) | all | main text |
| Table 3 | Robustness: in how many settings each of K1–K4 holds (x of y) | — | main text |

### 12.4 Numbers for the paper

- `analysis/numbers.py` writes `results/summary/paper_numbers.json`. It contains every number the paper may quote, under flat keys (e.g. `x1.difficulty.v1.NC.mean`, `.ci_low`, `.ci_high`), plus the run metadata.
- `RESULTS.md` is generated as well. It has one section per RQ, every number with its CI and its key, and every figure with a caption draft. The researcher writes the paper from `RESULTS.md`.

---

## 13. Pre-registration and freeze line

At milestone M2, before the full runs of EXP-P, EXP-F, EXP-X and EXP-S, create `PREREGISTRATION.md`. It contains:

- the primary configuration, with config hashes;
- the cells and the primary scenario (S2);
- the metrics;
- the expected results K1–K4 below.

Commit it and record the commit SHA in `DECISIONS.md`.

| ID | Expected result |
|---|---|
| K1 | On reward decisions, DN is higher for v2 than for v1. |
| K2 | At σ_n = 0.10, ST_exact on reward decisions is higher with δ_tie = 0.2 than with δ_tie = 0. |
| K3 | In S1 and S2, the final REG_fixed of TS_DEPLOYED is lower than that of RANDOM. |
| K4 | RTS is higher in C4 than in C3. |

Descriptive, with no prediction:

- how often v1 names a non-contributing factor for difficulty decisions (NC);
- C2 vs C1 on TIB, FRUS and BORE. The engagement-only rule may ease difficulty after failure streaks, but it cannot tell frustration from boredom, and it drifts back to the curriculum level once engagement stops changing. Report whatever the runs show;
- TS_CTX vs TS_DEPLOYED in S2;
- FID90 in S0;
- Δθ across conditions.

Results that contradict K1–K4 are reported as they are. The algorithm is never tuned after seeing results.

---

## 14. Tests and acceptance criteria

**Unit and integration tests (Vitest):**

1. **RNG.** The same seed gives the same sequence; different stream names give different sequences. Uniform mean and variance are within tolerance over 10⁶ draws; the normal has mean 0 ± 0.005 and sd 1 ± 0.005.
2. **Beta sampler.** The mean over 100,000 draws is within 0.01 of a/(a+b) for (1, 1), (2, 5) and (30, 10), as in Part B §8.5.
3. **Allocator.**
   - Equal states give probsTS ≈ 1/3 each (± 0.02).
   - Propensities sum to 1 (± 1e-9) and each is ≥ RANDOM_SHARE/3.
   - Over 30,000 allocations, empirical frequencies match the propensities (± 0.01).
   - The `sample` and `probs` modes give arm frequencies within ± 0.01 of each other, for three fixed posteriors.
4. **Signals.**
   - Cold starts: u = 0 with no history; b = 0 below B_min; e = 0 below E_min.
   - Every signal stays in [−1, 1].
   - b and e use only past data: appending a later observation does not change earlier values.
5. **Difficulty.**
   - DDA-E reproduces hand-computed values of clip(base · (1 + e), 1, 5).
   - The first task of a session is never explained.
   - The `suppressed_by_clip` case is covered.
6. **Explanations (hand-computed cases).**
   - Contributions (+0.5, −0.3, −0.3) with Δ = −0.1: v1 names the first factor (SI = 1); v2 names the second and third factors as a near tie.
   - Contributions (0.30, 0.27, 0) give two factors with δ_tie = 0.2, and one factor with δ_tie = 0.
   - |Δ| < ε returns null.
   - A DDA-E difficulty step where v1's dominant factor is u gives NC = 1, while v2 names e.
7. **Templates.** Every (output, direction, factor) combination produces a complete sentence, with no unreplaced placeholder.
8. **Information barrier.** A test parses the imports and fails if `src/core/**` imports from `src/sim/**`, or if any policy other than ORACLE imports `oracle.ts`.
9. **End-to-end determinism.** A tiny EXP-P (N = 20, S = 3, 2 seeds, 3 cells), run twice, produces identical output file hashes.
10. **Common random numbers.** For the same seed, learner i's θ₀ is identical across cells.
11. **Calibration.** Field-replica tier success rates are within ± 0.02 of their targets, or of the recorded reachable value.
12. **Golden test.** The `learners.csv` summary of a small fixed run is stored in the repo. Any change makes the test fail and must be explained in `DECISIONS.md`.

**Acceptance before the main runs:**

- all tests pass;
- the EXP-CAL plausibility targets are met, or any deviation is recorded and accepted by the researcher;
- the `--quick` version of every experiment, followed by `make_all.py`, runs end to end.

---

## 15. Milestones

| Milestone | Contents | Target |
|---|---|---|
| M0 | Repo, RNG, the core (signals, reward, difficulty, explanations, templates, bandit), tests 1–8 | Fri 16 Oct |
| M1 | Learner model, engine, policies, EXP-CAL, tests 9–12, `--quick` runs | Sat 17 Oct, midday |
| M2 | Pre-registration commit; full runs of EXP-P, EXP-F and EXP-X | Sat 17 Oct, evening |
| M3 | Analysis: Figs A, B, D, E and F; Tables 1–2; `paper_numbers.json`; `RESULTS.md`; `example_cases.json` | Sun 18 Oct, midday |
| M4 | EXP-S, Fig G, Table 3, Fig C | Sun 18 Oct, evening |
| M5 (optional) | Field-study power (10.4); Latin hypercube | After the paper, for Report 5 |

If behind schedule, cut in this order:

1. M5;
2. Fig C;
3. reduce EXP-S to the six parameters with the largest expected influence: `gain_scale`, ℓ_r, φ_frus, σ_rt, `grader_error`, s_D;
4. reduce EXP-P from 30 seeds to 15.

Never cut EXP-CAL, the pre-registration or the tests.

---

## 16. Out of scope, and limitations to state in the paper

**Out of scope for this repository:**

- any UI;
- any LLM calls;
- integration into the LearnSpace app or Supabase;
- real learner data;
- porting `src/core` into the Edge Function (done later, outside this repo);
- social features;
- any effect of rewards on learners.

**Limitations the paper must report:**

1. Learners are synthetic. Engagement dynamics and learning increments are stylised. The sensitivity analysis checks that conclusions do not hinge on them, but it cannot show that real learners behave this way.
2. Rewards, XP and explanations have no modelled effect on learners. The simulation evaluates properties of the explanations, not their effect on trust or understanding.
3. The grader is perfect by default; grader error is examined only in EXP-S.
4. Bandit updates are immediate; parallel classroom sessions are not modelled.
5. Results describe algorithmic behaviour, not learning outcomes. Effects on learners require the planned user study.

---

## 17. References (verify each against the original before citing)

- Agrawal, S., & Goyal, N. (2012). Analysis of Thompson sampling for the multi-armed bandit problem. *COLT 2012*.
- Baker, R. S. J. d., Corbett, A. T., & Aleven, V. (2008). More accurate student modeling through contextual estimation of slip and guess probabilities in Bayesian Knowledge Tracing. *ITS 2008*, LNCS 5091.
- Baker, R. S. J. d., D'Mello, S. K., Rodrigo, M. M. T., & Graesser, A. C. (2010). Better to be frustrated than bored. *International Journal of Human-Computer Studies, 68*(4).
- Chinn, S. (2000). A simple method for converting an odds ratio to effect size for use in meta-analysis. *Statistics in Medicine, 19*(22).
- Clement, B., Roy, D., Oudeyer, P.-Y., & Lopes, M. (2015). Multi-armed bandits for intelligent tutoring systems. *Journal of Educational Data Mining, 7*(2).
- Corbett, A. T., & Anderson, J. R. (1994). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction, 4*(4).
- D'Mello, S., & Graesser, A. (2012). Dynamics of affective states during complex learning. *Learning and Instruction, 22*(2).
- Doroudi, S., Aleven, V., & Brunskill, E. (2019). Where's the reward? A review of reinforcement learning for instructional sequencing. *International Journal of Artificial Intelligence in Education, 29*.
- Embretson, S. E., & Reise, S. P. (2000). *Item Response Theory for Psychologists*. Lawrence Erlbaum.
- Hadad, V., Hirshberg, D. A., Zhan, R., Wager, S., & Athey, S. (2021). Confidence intervals for policy evaluation in adaptive experiments. *PNAS, 118*(15).
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist, 38*(1).
- Law, A. M. (2015). *Simulation Modeling and Analysis* (5th ed.). McGraw-Hill.
- Marsaglia, G., & Tsang, W. W. (2000). A simple method for generating gamma variables. *ACM Transactions on Mathematical Software, 26*(3).
- Russo, D. J., Van Roy, B., Kazerouni, A., Osband, I., & Wen, Z. (2018). A tutorial on Thompson sampling. *Foundations and Trends in Machine Learning, 11*(1).
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational Research, 78*(1).
- Sutton, R. S., & Barto, A. G. (2018). *Reinforcement Learning: An Introduction* (2nd ed.), Chapter 2. MIT Press.
- van der Linden, W. J. (2006). A lognormal model for response times on test items. *Journal of Educational and Behavioral Statistics, 31*(2).
- Venable, J., Pries-Heje, J., & Baskerville, R. (2016). FEDS: A framework for evaluation in design science research. *European Journal of Information Systems, 25*(1).
- Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications, 10*.
- Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback revisited: A meta-analysis of educational feedback research. *Frontiers in Psychology, 10*.
