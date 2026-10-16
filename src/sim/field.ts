// Field-study replica (SIMULATION_SPEC.md section 9.3): one session per learner, 12 questions in tier order,
// no gamification and no DDA, quitting allowed, TS_DEPLOYED in 'probs' mode with logged propensities.

import { estimateThompsonProbs } from '../core/bandit/allocator.ts';
import { SignalTracker } from '../core/signals.ts';
import { ARMS, type AlgorithmConfig, type Observation } from '../core/types.ts';
import type { LearnerParams, Scenario } from './config.ts';
import type { Tier, TierDeltas } from './curriculum.ts';
import { Learner } from './learner.ts';
import { csvLine } from './log.ts';
import { makePolicy, type ObservableContext } from './policies.ts';
import { drawPopulation } from './population.ts';
import { stream } from './rng.ts';

export interface FieldSpec {
  N: number;
  scenario: Scenario;
  seed: number;
  algo: AlgorithmConfig;
  learner: LearnerParams;
  tierOrder: Tier[];
  deltas: TierDeltas;
  draws: number;
  pbestDraws: number;
  threshold: number;
  tsMode: 'sample' | 'probs';
}

export const FIELD_DECISION_COLUMNS = [
  'N', 'scenario', 'seed', 'decision', 'learner', 'question', 'tier', 'half', 'arm', 'prop_plain', 'prop_hint',
  'prop_example', 'ts_plain', 'ts_hint', 'ts_example', 'retryCorrect_obs', 'h_pi_plain', 'h_pi_hint', 'h_pi_example',
] as const;

export const FIELD_RUN_COLUMNS = [
  'N', 'scenario', 'seed', 'decisions', 'questions_answered', 'first_correct_share', 'wrong_first_share',
  'mistakes_per_learner', 'quit_share', 'a_plain', 'b_plain', 'a_hint', 'b_hint', 'a_example', 'b_example',
  'pbest_plain', 'pbest_hint', 'pbest_example', 'mean_pi_plain', 'mean_pi_hint', 'mean_pi_example', 'true_best_arm',
  'pbest_true_best', 'ID90', 'FID90',
] as const;

export interface FieldResult {
  decisionCsv: string;
  runCsv: string;
}

export function runField(spec: FieldSpec): FieldResult {
  const { N, seed, algo, learner: lp } = spec;
  const population = drawPopulation(N, seed, lp);
  const policy = makePolicy('TS_DEPLOYED', { ...algo.bandit, draws: spec.draws }, spec.tsMode, stream(seed, 'policy'));
  const order = stream(seed, 'week:1:order').shuffle(population.map((_, i) => i));
  const tag = [N, spec.scenario.id, seed] as const;
  let decisionCsv = '';
  let decisions = 0;
  let answered = 0;
  let firstCorrect = 0;
  let quits = 0;
  const piSum = [0, 0, 0];

  for (const id of order) {
    const l = new Learner(id, population[id], lp, spec.scenario, seed);
    const tracker = new SignalTracker(algo.signals); // gives the policy its observable context
    const T = spec.tierOrder.length;
    for (let k = 1; k <= T; k++) {
      const tier = spec.tierOrder[k - 1];
      const ctx: ObservableContext = { signals: tracker.signals() };
      const o = l.doTask(spec.deltas[tier], () => policy.choose(ctx));
      answered++;
      if (o.observedCorrect) firstCorrect++;
      if (o.arm !== null && o.pi !== null) {
        policy.update(o.arm, o.observedRetry ? 1 : 0, ctx);
        decisions++;
        ARMS.forEach((a, j) => (piSum[j] += o.pi![a]));
        const c = policy.lastChoice;
        decisionCsv += csvLine([
          ...tag, decisions, id, k, tier, c?.half, o.arm, c?.propensities?.plain, c?.propensities?.hint,
          c?.propensities?.example, c?.thompsonProbs?.plain, c?.thompsonProbs?.hint, c?.thompsonProbs?.example,
          o.observedRetry, o.pi.plain, o.pi.hint, o.pi.example,
        ]);
      }
      l.learn(o);
      const quit = l.updateEngagement(o, k === T);
      const obs: Observation = {
        session: 1, taskInSession: k, plannedTasks: T, difficulty: 3, firstCorrect: o.observedCorrect,
        dontKnow: o.dontKnow, rtSeconds: o.rtSeconds, arm: o.arm, retryCorrect: o.observedRetry,
        retryDontKnow: o.retryDontKnow,
      };
      tracker.recordTask(obs);
      if (quit) {
        quits++;
        break;
      }
    }
  }

  const post = policy.posteriors()!.global;
  const pbest = estimateThompsonProbs(post, spec.pbestDraws, stream(seed, 'pbest'));
  const meanPi = piSum.map((s) => (decisions ? s / decisions : 0));
  const spread = Math.max(...meanPi) - Math.min(...meanPi);
  const best = spread > 1e-12 ? meanPi.indexOf(Math.max(...meanPi)) : -1; // none when all arms are equal (S0)
  const pb = [pbest.plain, pbest.hint, pbest.example];
  const runCsv = csvLine([
    ...tag, decisions, answered, firstCorrect / answered, 1 - firstCorrect / answered, decisions / N, quits / N,
    post.plain.a, post.plain.b, post.hint.a, post.hint.b, post.example.a, post.example.b, ...pb, ...meanPi,
    best >= 0 ? ARMS[best] : null, best >= 0 ? pb[best] : null, best >= 0 ? pb[best] >= spec.threshold : null,
    Math.max(...pb) >= spec.threshold,
  ]);
  return { decisionCsv, runCsv };
}
