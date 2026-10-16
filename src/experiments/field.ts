// EXP-F, the field-study replica (SIMULATION_SPEC.md section 9.3).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAlgorithmConfig, loadExperimentConfig, loadLearnerParams, loadScenarios } from '../sim/config.ts';
import type { Tier, TierDeltas } from '../sim/curriculum.ts';
import { FIELD_DECISION_COLUMNS, FIELD_RUN_COLUMNS, type FieldResult, type FieldSpec } from '../sim/field.ts';
import { GzCsvWriter } from '../sim/log.ts';
import { REPO_ROOT, RunMeta } from '../sim/meta.ts';
import { runJobs, type Job } from '../sim/pool.ts';
import { CONFIG_FILES, git, outDir, seedRange, type RunOptions } from './common.ts';

export interface FieldConfig {
  N_values: number[];
  scenarios: string[];
  seeds: { from: number; to: number };
  tier_order: Tier[];
  ts_mode: 'sample' | 'probs';
  draws: number;
  draws_fast: number;
  pbest_draws: number;
  identification_threshold: number;
  quick: { runs: number };
}

export const CALIBRATION_FILE = resolve(REPO_ROOT, 'results', 'summary', 'calibration.json');

export function loadTierDeltas(path = CALIBRATION_FILE): TierDeltas {
  const cal = JSON.parse(readFileSync(path, 'utf8')) as { field_tiers: Record<Tier, { delta: number }> };
  return { warmup: cal.field_tiers.warmup.delta, easy: cal.field_tiers.easy.delta, hard: cal.field_tiers.hard.delta };
}

export async function runFieldExperiment(opts: RunOptions, over: { seeds?: number[]; N_values?: number[] } = {}): Promise<void> {
  const g = git(opts);
  const cfg = loadExperimentConfig<FieldConfig>('field');
  const algo = loadAlgorithmConfig();
  const lp = loadLearnerParams();
  const scenarios = loadScenarios();
  const deltas = loadTierDeltas();
  const seeds = over.seeds ?? (opts.quick ? seedRange({ from: cfg.seeds.from, to: cfg.seeds.from + cfg.quick.runs - 1 }) : seedRange(cfg.seeds));
  const draws = opts.fast ? cfg.draws_fast : cfg.draws;
  const dir = outDir('field', opts);
  const meta = new RunMeta('field', g, [CONFIG_FILES.algorithm, CONFIG_FILES.learner, CONFIG_FILES.scenarios, CONFIG_FILES.experiment('field'), CALIBRATION_FILE], {
    quick: opts.quick, fast: opts.fast, draws, seeds: [seeds[0], seeds[seeds.length - 1]], tier_deltas: deltas,
  });
  const jobs: Job[] = [];
  for (const N of over.N_values ?? cfg.N_values) {
    for (const sc of cfg.scenarios) {
      for (const seed of seeds) {
        const spec: FieldSpec = {
          N, scenario: scenarios[sc], seed, algo, learner: lp, tierOrder: cfg.tier_order, deltas, draws,
          pbestDraws: cfg.pbest_draws, threshold: cfg.identification_threshold, tsMode: cfg.ts_mode,
        };
        jobs.push({ kind: 'field', payload: spec });
      }
    }
  }
  const decisions = new GzCsvWriter(resolve(dir, 'decisions.csv.gz'), FIELD_DECISION_COLUMNS);
  const runs = new GzCsvWriter(resolve(dir, 'runs.csv.gz'), FIELD_RUN_COLUMNS);
  await runJobs<FieldResult>(jobs, (_, r) => {
    decisions.write(r.decisionCsv);
    runs.write(r.runCsv);
  }, { workers: opts.workers, label: 'EXP-F', quiet: opts.quiet });
  await Promise.all([decisions.close(), runs.close()]);
  meta.write(dir);
}
