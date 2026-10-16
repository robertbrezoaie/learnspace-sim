// EXP-CAL, calibration and plausibility checks (SIMULATION_SPEC.md section 9.1). Runs before the freeze.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAlgorithmConfig, loadExperimentConfig, loadLearnerParams, loadScenarios, type LearnerParams } from '../sim/config.ts';
import type { Tier } from '../sim/curriculum.ts';
import { LEARNER_COLUMNS, TASK_COLUMNS, runPipeline } from '../sim/engine.ts';
import { runField } from '../sim/field.ts';
import { expectedSuccess } from '../sim/learner.ts';
import { csvText } from '../sim/log.ts';
import { RunMeta } from '../sim/meta.ts';
import { drawPopulation, type LearnerTraits } from '../sim/population.ts';
import { CONFIG_FILES, git, outDir, summaryDir, type RunOptions } from './common.ts';
import type { FieldConfig } from './field.ts';

interface CalConfig {
  field_tiers: { targets: Record<Tier, number>; learners: number; seed: number; bisection_tolerance: number };
  static_run: { difficulty: 'STATIC'; policy: 'PLAIN'; scenario: string; N: number; seed: number };
  plausibility_targets: {
    median_learner_success_per_session: [number, number];
    churn_by_last_session: [number, number];
    dont_know_rate: [number, number];
    field_replica_wrong_first_answers_share: number;
    field_replica_mistakes_per_learner: number;
  };
}

/** Search interval for the tier logits. */
const DELTA_LO = -8;
const DELTA_HI = 8;

/** Mean expected first-attempt success ("don't know" included) of a population at E = E*, difficulty logit delta. */
export function meanSuccess(pop: LearnerTraits[], delta: number, p: LearnerParams): number {
  let s = 0;
  for (const t of pop) s += expectedSuccess(t.theta0, delta, t.Estar, p);
  return s / pop.length;
}

/** Bisection for the delta at which mean success equals the target; mean success decreases with delta. */
export function calibrateTier(pop: LearnerTraits[], target: number, tol: number, p: LearnerParams) {
  const maxReachable = meanSuccess(pop, DELTA_LO, p);
  const reachable = target <= maxReachable;
  // If the target cannot be reached, aim at the largest reachable value (within the tolerance) instead.
  const aim = reachable ? target : maxReachable - tol;
  let lo = DELTA_LO;
  let hi = DELTA_HI;
  for (let it = 0; it < 200 && hi - lo > 1e-10; it++) {
    const mid = (lo + hi) / 2;
    if (meanSuccess(pop, mid, p) > aim) lo = mid;
    else hi = mid;
  }
  const delta = (lo + hi) / 2;
  return { target, reachable, aimed: aim, delta, achieved: meanSuccess(pop, delta, p), max_reachable: maxReachable };
}

export async function runCalibration(opts: RunOptions): Promise<Record<string, unknown>> {
  const g = git(opts);
  const cfg = loadExperimentConfig<CalConfig>('cal');
  const fieldCfg = loadExperimentConfig<FieldConfig>('field');
  const algo = loadAlgorithmConfig();
  const scenarios = loadScenarios();
  const dir = outDir('cal', opts);
  const meta = new RunMeta('cal', g, [CONFIG_FILES.algorithm, CONFIG_FILES.learner, CONFIG_FILES.scenarios, CONFIG_FILES.experiment('cal')], {});

  // 1. Field-study tiers
  const lpDefault = loadLearnerParams();
  const pop = drawPopulation(cfg.field_tiers.learners, cfg.field_tiers.seed, lpDefault);
  const tiers = {} as Record<Tier, ReturnType<typeof calibrateTier>>;
  for (const tier of ['warmup', 'easy', 'hard'] as Tier[]) {
    tiers[tier] = calibrateTier(pop, cfg.field_tiers.targets[tier], cfg.field_tiers.bisection_tolerance, lpDefault);
  }

  // 2. Static plausibility run
  const sr = cfg.static_run;
  const lp = loadLearnerParams({ N: sr.N });
  const run = runPipeline({
    cell: 'CAL', difficulty: sr.difficulty, policy: sr.policy, scenario: scenarios[sr.scenario], seed: sr.seed, algo,
    learner: lp, tsMode: 'sample', logTasks: true, snapshotEvery: 100, snapshotDraws: 0, curveEvery: 100,
  });
  const ix = (name: string) => TASK_COLUMNS.indexOf(name as (typeof TASK_COLUMNS)[number]);
  const iS = ix('session'), iL = ix('learner'), iC = ix('firstCorrect_obs'), iDk = ix('dontKnow'), iTh = ix('h_theta'), iP = ix('h_P');
  const perSession = new Map<number, { tasks: number; correct: number; dk: number; theta: number; P: number; learners: Map<number, [number, number]> }>();
  for (const line of run.taskCsv!.split('\n')) {
    if (!line) continue;
    const f = line.split(',');
    const s = Number(f[iS]);
    let a = perSession.get(s);
    if (!a) perSession.set(s, (a = { tasks: 0, correct: 0, dk: 0, theta: 0, P: 0, learners: new Map() }));
    a.tasks++;
    a.correct += Number(f[iC]);
    a.dk += Number(f[iDk]);
    a.theta += Number(f[iTh]);
    a.P += Number(f[iP]);
    const l = Number(f[iL]);
    const lc = a.learners.get(l) ?? [0, 0];
    lc[0]++;
    lc[1] += Number(f[iC]);
    a.learners.set(l, lc);
  }
  const sessions = [...perSession.entries()].sort((x, y) => x[0] - y[0]).map(([s, a]) => {
    const rates = [...a.learners.values()].map(([n, c]) => c / n).sort((x, y) => x - y);
    const mid = rates.length / 2;
    const median = rates.length % 2 ? rates[Math.floor(mid)] : (rates[mid - 1] + rates[mid]) / 2;
    return {
      session: s,
      attendance: a.learners.size / sr.N,
      mean_tasks_done: a.tasks / a.learners.size,
      mean_first_attempt_success: a.correct / a.tasks,
      median_learner_success: median,
      mean_true_P: a.P / a.tasks,
      mean_theta: a.theta / a.tasks,
      dont_know_rate: a.dk / a.tasks,
    };
  });
  const iChurn = LEARNER_COLUMNS.indexOf('churned');
  const learnerRows = run.learnerCsv.trimEnd().split('\n').map((l) => l.split(','));
  const churn = learnerRows.filter((f) => f[iChurn] === '1').length / learnerRows.length;
  const dkTotal = sessions.reduce((s, x) => s + x.dont_know_rate * x.mean_tasks_done * x.attendance, 0) /
    sessions.reduce((s, x) => s + x.mean_tasks_done * x.attendance, 0);

  // 3. Field replica check (scenario S2, one large run)
  const field = runField({
    N: sr.N, scenario: scenarios[sr.scenario], seed: sr.seed, algo, learner: lpDefault, tierOrder: fieldCfg.tier_order,
    deltas: { warmup: tiers.warmup.delta, easy: tiers.easy.delta, hard: tiers.hard.delta }, draws: 0,
    pbestDraws: 1000, threshold: fieldCfg.identification_threshold, tsMode: 'sample',
  });
  const fr = field.runCsv.trimEnd().split(',');
  const wrongShare = Number(fr[6]);
  const mistakesPerLearner = Number(fr[7]);

  const t = cfg.plausibility_targets;
  const medians = sessions.map((s) => s.median_learner_success);
  const within = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi;
  const checks = {
    median_learner_success_per_session: {
      target: t.median_learner_success_per_session, min: Math.min(...medians), max: Math.max(...medians),
      pass: medians.every((m) => within(m, t.median_learner_success_per_session)),
    },
    churn_by_last_session: { target: t.churn_by_last_session, value: churn, pass: within(churn, t.churn_by_last_session) },
    dont_know_rate: { target: t.dont_know_rate, value: dkTotal, pass: within(dkTotal, t.dont_know_rate) },
    field_replica_wrong_first_answers_share: { target: t.field_replica_wrong_first_answers_share, value: wrongShare, pass: null, note: 'approximate target ("about"); reported, not enforced' },
    field_replica_mistakes_per_learner: { target: t.field_replica_mistakes_per_learner, value: mistakesPerLearner, pass: null, note: 'approximate target ("about"); reported, not enforced' },
  };

  const result = {
    synthetic_data: true,
    note: 'Synthetic learners. Tier logits are difficulty values delta on the learner logit scale (Report 5 question-bank design targets).',
    field_tiers: tiers,
    plausibility: checks,
    all_enforced_targets_met: Object.values(checks).every((c) => c.pass !== false),
    static_run: { ...sr, final_churn: churn },
  };
  const sdir = summaryDir({ ...opts, quick: false });
  mkdirSync(sdir, { recursive: true });
  writeFileSync(resolve(sdir, 'calibration.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(resolve(sdir, 'cal_static_sessions.csv'), csvText(Object.keys(sessions[0]), sessions));
  meta.write(dir);

  if (!opts.quiet) {
    console.log('Field tiers:', Object.entries(tiers).map(([k, v]) => `${k}: delta=${v.delta.toFixed(3)} success=${v.achieved.toFixed(3)}${v.reachable ? '' : ' (target unreachable)'}`).join('; '));
    console.table(sessions.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v.toFixed(3))]))));
    for (const [k, c] of Object.entries(checks)) console.log(`${k}: ${JSON.stringify(c)}`);
  }
  return result;
}
