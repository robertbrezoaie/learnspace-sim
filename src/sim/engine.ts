// Closed-loop simulation engine (SIMULATION_SPEC.md section 8): one run = one cell x scenario x seed.

import { difficultyDecision, type DifficultyRule } from '../core/difficulty.ts';
import { explainRandom, explainV1, explainV2 } from '../core/explain.ts';
import { taskXP } from '../core/gamification.ts';
import { rewardDecision } from '../core/reward.ts';
import { SignalTracker } from '../core/signals.ts';
import { ARMS, type AlgorithmConfig, type Factor, type Observation } from '../core/types.ts';
import type { LearnerParams, Scenario } from './config.ts';
import { Learner } from './learner.ts';
import { csvLine, type Cell } from './log.ts';
import { OracleView, makeOraclePolicy } from './oracle.ts';
import { makePolicy, snapshotProbs, type FeedbackPolicy, type ObservableContext, type PolicyName } from './policies.ts';
import { drawPopulation } from './population.ts';
import { stream } from './rng.ts';

export interface RunSpec {
  cell: string;
  difficulty: DifficultyRule;
  policy: PolicyName;
  scenario: Scenario;
  seed: number;
  algo: AlgorithmConfig;
  learner: LearnerParams; // N, S and T are taken from here
  tsMode: 'sample' | 'probs';
  logTasks: boolean;
  snapshotEvery: number;
  snapshotDraws: number;
  curveEvery: number;
}

export const TASK_COLUMNS = [
  'cell', 'scenario', 'seed', 'learner', 'session', 'task', 'D_base', 'D', 'clipped', 'suppressed_by_clip',
  'firstCorrect_obs', 'dontKnow', 'rt', 'arm', 'half', 'retryCorrect_obs', 'retryDontKnow', 'u', 'b', 'e',
  'c_u', 'c_b', 'c_e', 'aiReward', 'm', 'XP', 'e_prev', 'e_prev2', 'c_e_diff', 'step_planned', 'step_realized',
  'v2_reward_factors', 'v2_diff_factors', 'v1_factor', 'v1_factor_diff', 'rand_reward_factor', 'rand_diff_factor',
  'quit', 'h_theta', 'h_E', 'h_P', 'h_correct', 'h_retryCorrect', 'h_pi_plain', 'h_pi_hint', 'h_pi_example',
] as const;

export const LEARNER_COLUMNS = [
  'cell', 'scenario', 'seed', 'learner', 'theta0', 'theta_final', 'delta_theta', 'Estar', 'E_mean',
  'sessions_attended', 'churned', 'churn_session', 'tasks', 'quits', 'FAS', 'RTS', 'TIB', 'FRUS', 'BORE',
  'dont_know_rate', 'n_expl_reward', 'n_expl_diff', 'mistakes', 'retries_correct', 'regret_oracle_sum',
] as const;

export const CURVE_COLUMNS = ['cell', 'scenario', 'seed', 'decision', 'REG_oracle', 'REG_fixed', 'VAL'] as const;

export const SNAPSHOT_COLUMNS = [
  'cell', 'scenario', 'seed', 'decision', 'context', 'a_plain', 'b_plain', 'a_hint', 'b_hint', 'a_example',
  'b_example', 'p_plain', 'p_hint', 'p_example',
] as const;

export const RUN_COLUMNS = [
  'cell', 'scenario', 'seed', 'policy', 'difficulty', 'N', 'decisions', 'REG_oracle', 'REG_fixed', 'VAL',
  'best_fixed_arm', 'share_plain', 'share_hint', 'share_example', 'T95', 'final_pbest_bestarm',
] as const;

export interface RunResult {
  learnerCsv: string; // rows without header
  taskCsv: string | null; // rows without header (only when logTasks)
  curveCsv: string;
  snapshotCsv: string;
  runCsv: string; // one row
}

/** Algorithm-side state per learner: only observable data. */
interface AlgoState {
  tracker: SignalTracker;
  missedWeeks: number;
  eUsed: number; // e used for the previous task's difficulty
  prevD: number;
  lastV1: Factor; // v1 factor at the last decision point (explains the next difficulty)
}

interface LearnerStats {
  sessions: number;
  churnSession: number | null;
  tasks: number;
  firstCorrect: number;
  dontKnow: number;
  mistakes: number;
  retriesCorrect: number;
  tib: number;
  Esum: number;
  frus: number;
  bore: number;
  boreRun: number;
  quits: number;
  explReward: number;
  explDiff: number;
  regret: number;
}

const factorList = (f: readonly Factor[] | null | undefined): string | null => (f ? f.join('|') : null);

export function runPipeline(spec: RunSpec): RunResult {
  const { algo, learner: lp, seed } = spec;
  const N = lp.N;
  const S = lp.S;
  const T = lp.T;
  const deltaTie = algo.explanation.delta_tie;

  const population = drawPopulation(N, seed, lp);
  const learners = population.map((tr, i) => new Learner(i, tr, lp, spec.scenario, seed));
  const algoState: AlgoState[] = learners.map(() => ({
    tracker: new SignalTracker(algo.signals),
    missedWeeks: 0,
    eUsed: 0,
    prevD: 0,
    lastV1: 'u',
  }));
  const stats: LearnerStats[] = learners.map(() => ({
    sessions: 0, churnSession: null, tasks: 0, firstCorrect: 0, dontKnow: 0, mistakes: 0, retriesCorrect: 0,
    tib: 0, Esum: 0, frus: 0, bore: 0, boreRun: 0, quits: 0, explReward: 0, explDiff: 0, regret: 0,
  }));

  const view = new OracleView();
  const policyRng = stream(seed, 'policy');
  const policy: FeedbackPolicy =
    spec.policy === 'ORACLE' ? makeOraclePolicy(view) : makePolicy(spec.policy, algo.bandit, spec.tsMode, policyRng);
  const xrandom = stream(seed, 'xrandom');
  const snapshotRng = stream(seed, 'snapshot');

  // bandit decisions of the whole run (true retry probabilities and the chosen arm)
  const piLog: number[][] = [[], [], []];
  const chosen: number[] = [];
  let snapshotCsv = '';
  const tag = [spec.cell, spec.scenario.id, seed] as const;
  const taskLines: string[] = [];

  for (let s = 1; s <= S; s++) {
    const attendees: number[] = [];
    for (const l of learners) {
      if (l.churned) continue;
      if (s > 1) l.weeklyRecovery();
      if (l.attends()) {
        l.absences = 0;
        attendees.push(l.id);
      } else {
        l.absences++;
        algoState[l.id].missedWeeks++;
        if (l.absences >= lp.absences_to_churn) {
          l.churned = true;
          stats[l.id].churnSession = s;
        }
      }
    }
    const order = stream(seed, `week:${s}:order`).shuffle(attendees);
    for (const id of order) runSession(id, s);
  }

  function runSession(id: number, s: number): void {
    const l = learners[id];
    const st = algoState[id];
    const ls = stats[id];
    st.tracker.recordSlots(st.missedWeeks * T, algo.signals.activity_values.absent_slot);
    st.missedWeeks = 0;
    ls.sessions++;
    let signals = st.tracker.signals();

    for (let k = 1; k <= T; k++) {
      const dd = difficultyDecision(
        {
          rule: spec.difficulty,
          session: s,
          sessions: S,
          firstTaskOfSession: k === 1,
          ePrev: signals.e,
          ePrevUsed: st.eUsed,
          prevDifficulty: st.prevD,
        },
        algo.difficulty,
      );
      const ePrev2 = st.eUsed;
      st.eUsed = signals.e;
      st.prevD = dd.difficulty;

      const ctx: ObservableContext = { signals };
      const delta = lp.s_D * (dd.difficulty - 3);
      const o = l.doTask(delta, (pi) => {
        view.current = pi;
        return policy.choose(ctx);
      });

      let half: string | null = null;
      if (o.arm !== null && o.pi !== null) {
        half = policy.lastChoice?.half ?? null;
        policy.update(o.arm, o.observedRetry ? 1 : 0, ctx);
        const best = Math.max(o.pi.plain, o.pi.hint, o.pi.example);
        ls.regret += best - o.pi[o.arm];
        ARMS.forEach((a, j) => piLog[j].push(o.pi![a]));
        chosen.push(ARMS.indexOf(o.arm));
        const posts = policy.posteriors();
        if (posts && chosen.length % spec.snapshotEvery === 0) {
          for (const [context, post] of Object.entries(posts)) {
            const p = snapshotProbs(post, spec.snapshotDraws, snapshotRng);
            snapshotCsv += csvLine([
              ...tag, chosen.length, context, post.plain.a, post.plain.b, post.hint.a, post.hint.b,
              post.example.a, post.example.b, p.plain, p.hint, p.example,
            ]);
          }
        }
      }

      l.learn(o);
      const quit = l.updateEngagement(o, k === T);

      const obs: Observation = {
        session: s,
        taskInSession: k,
        plannedTasks: T,
        difficulty: dd.difficulty,
        firstCorrect: o.observedCorrect,
        dontKnow: o.dontKnow,
        rtSeconds: o.rtSeconds,
        arm: o.arm,
        retryCorrect: o.observedRetry,
        retryDontKnow: o.retryDontKnow,
      };
      st.tracker.recordTask(obs);
      signals = st.tracker.signals();

      // reward decision and XP for this task
      const rd = rewardDecision(signals, algo.reward);
      const xp = taskXP(o.observedCorrect || o.observedRetry === true, dd.difficulty, rd.multiplier, algo.gamification);

      // explanations
      const v1 = explainV1(rd.contributions);
      const v2r = explainV2('reward', rd.contributions, rd.aiReward, algo.reward.eps_r, deltaTie);
      const randR = v2r ? explainRandom(rd.contributions, xrandom) : null;
      const diffExplainable = dd.contributions !== null && !dd.suppressedByClip;
      const v2d = diffExplainable
        ? explainV2('difficulty', dd.contributions!, dd.plannedStep!, algo.difficulty.eps_D, deltaTie)
        : null;
      const randD = v2d ? explainRandom(dd.contributions!, xrandom) : null;
      const v1Diff = k === 1 ? null : st.lastV1;
      st.lastV1 = v1;

      // per-learner metrics
      ls.tasks++;
      if (o.observedCorrect) ls.firstCorrect++;
      if (o.dontKnow) ls.dontKnow++;
      if (o.arm !== null) ls.mistakes++;
      if (o.observedRetry) ls.retriesCorrect++;
      if (o.P >= lp.band_lo && o.P <= lp.band_hi) ls.tib++; // TIB always uses the default band
      ls.Esum += l.E;
      if (l.streak === 3) ls.frus++;
      ls.boreRun = o.P > lp.p_bore ? ls.boreRun + 1 : 0;
      if (ls.boreRun === 5) ls.bore++;
      if (v2r) ls.explReward++;
      if (v2d) ls.explDiff++;

      if (spec.logTasks) {
        const c = rd.contributions;
        const cells: Cell[] = [
          ...tag, id, s, k, dd.base, dd.difficulty, dd.clipped, dd.suppressedByClip, o.observedCorrect, o.dontKnow,
          o.rtSeconds, o.arm, half, o.observedRetry, o.retryDontKnow, signals.u, signals.b, signals.e, c.u, c.b, c.e,
          rd.aiReward, rd.multiplier, xp, st.eUsed, k === 1 ? null : ePrev2, dd.contributions?.e ?? null,
          dd.plannedStep, dd.realizedStep, factorList(v2r?.factors), factorList(v2d?.factors), v1, v1Diff, randR,
          randD, quit, l.theta, l.E, o.P, o.correct, o.retryCorrect, o.pi?.plain, o.pi?.hint, o.pi?.example,
        ];
        taskLines.push(csvLine(cells));
      }

      if (quit) {
        st.tracker.recordSlots(T - k, algo.signals.activity_values.quit_slot);
        ls.quits++;
        break;
      }
    }
  }

  // learner rows
  let learnerCsv = '';
  learners.forEach((l, i) => {
    const ls = stats[i];
    learnerCsv += csvLine([
      ...tag, i, l.traits.theta0, l.theta, l.theta - l.traits.theta0, l.traits.Estar,
      ls.tasks ? ls.Esum / ls.tasks : null, ls.sessions, l.churned, ls.churnSession, ls.tasks, ls.quits,
      ls.tasks ? ls.firstCorrect / ls.tasks : null, ls.mistakes ? ls.retriesCorrect / ls.mistakes : null,
      ls.tasks ? ls.tib / ls.tasks : null, ls.frus, ls.bore, ls.tasks ? ls.dontKnow / ls.tasks : null,
      ls.explReward, ls.explDiff, ls.mistakes, ls.retriesCorrect, ls.regret,
    ]);
  });

  // bandit curves and run summary
  const n = chosen.length;
  const sums = piLog.map((col) => col.reduce((a, b) => a + b, 0));
  // best fixed arm in hindsight; none when all arms are equal (S0), where every regret is 0
  const bestFixed = Math.max(...sums) - Math.min(...sums) > 1e-9 ? sums.indexOf(Math.max(...sums)) : -1;
  let curveCsv = '';
  let regOracle = 0;
  let regFixed = 0;
  let val = 0;
  const shares = [0, 0, 0];
  for (let d = 0; d < n; d++) {
    const pis = [piLog[0][d], piLog[1][d], piLog[2][d]];
    const pc = pis[chosen[d]];
    regOracle += Math.max(pis[0], pis[1], pis[2]) - pc;
    regFixed += bestFixed >= 0 ? pis[bestFixed] - pc : 0;
    val += pc;
    shares[chosen[d]]++;
    if ((d + 1) % spec.curveEvery === 0) curveCsv += csvLine([...tag, d + 1, regOracle, regFixed, val / (d + 1)]);
  }

  // T95: first snapshot at which probsTS of the best fixed arm is >= 0.95 (global-state TS policies only)
  let t95: number | null = null;
  let finalPbest: number | null = null;
  if (snapshotCsv && spec.policy !== 'TS_CTX' && bestFixed >= 0) {
    const col = 11 + bestFixed;
    for (const line of snapshotCsv.trimEnd().split('\n')) {
      const f = line.split(',');
      const pb = Number(f[col]);
      finalPbest = pb;
      if (t95 === null && pb >= 0.95) t95 = Number(f[3]);
    }
  }
  const runCsv = csvLine([
    ...tag, spec.policy, spec.difficulty, N, n, regOracle, regFixed, n ? val / n : null, bestFixed >= 0 ? ARMS[bestFixed] : null,
    n ? shares[0] / n : null, n ? shares[1] / n : null, n ? shares[2] / n : null, t95, finalPbest,
  ]);

  return {
    learnerCsv,
    taskCsv: spec.logTasks ? taskLines.join('') : null,
    curveCsv,
    snapshotCsv,
    runCsv,
  };
}
