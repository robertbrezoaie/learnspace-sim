// EXP-P, the pipeline grid (SIMULATION_SPEC.md section 9.2).

import { resolve } from 'node:path';
import { loadAlgorithmConfig, loadExperimentConfig, loadLearnerParams, loadScenarios } from '../sim/config.ts';
import { CURVE_COLUMNS, LEARNER_COLUMNS, RUN_COLUMNS, SNAPSHOT_COLUMNS, type RunSpec } from '../sim/engine.ts';
import type { PipelineJob, PipelineJobResult } from '../sim/jobs.ts';
import { GzCsvWriter } from '../sim/log.ts';
import { RunMeta } from '../sim/meta.ts';
import { runJobs, type Job } from '../sim/pool.ts';
import { CONFIG_FILES, git, outDir, seedRange, type CellDef, type RunOptions } from './common.ts';

export interface PipelineConfig {
  N: number;
  S: number;
  T: number;
  seeds: { from: number; to: number };
  task_log_seeds: number[];
  ts_mode: 'sample' | 'probs';
  bandit_snapshot_every: number;
  bandit_snapshot_draws: number;
  curve_grid_every: number;
  cells: CellDef[];
  quick: { N: number; seeds: { from: number; to: number } };
}

export interface PipelineOverrides {
  N?: number;
  S?: number;
  seeds?: number[];
  cells?: string[];
}

export async function runPipelineExperiment(opts: RunOptions, over: PipelineOverrides = {}): Promise<void> {
  const g = git(opts);
  const cfg = loadExperimentConfig<PipelineConfig>('pipeline');
  const algo = loadAlgorithmConfig();
  const scenarios = loadScenarios();
  const N = over.N ?? (opts.quick ? cfg.quick.N : cfg.N);
  const seeds = over.seeds ?? seedRange(opts.quick ? cfg.quick.seeds : cfg.seeds);
  const lp = loadLearnerParams({ N, S: over.S ?? cfg.S, T: cfg.T });
  const dir = outDir('pipeline', opts);
  const meta = new RunMeta('pipeline', g, [CONFIG_FILES.algorithm, CONFIG_FILES.learner, CONFIG_FILES.scenarios, CONFIG_FILES.experiment('pipeline')], {
    quick: opts.quick, N, S: lp.S, T: lp.T, seeds,
  });

  const jobs: Job[] = [];
  for (const cell of cfg.cells) {
    if (over.cells && !over.cells.includes(cell.id)) continue;
    for (const sc of cell.scenarios) {
      for (const seed of seeds) {
        const spec: RunSpec = {
          cell: cell.id, difficulty: cell.difficulty, policy: cell.policy, scenario: scenarios[sc], seed, algo,
          learner: lp, tsMode: cfg.ts_mode, logTasks: false, snapshotEvery: cfg.bandit_snapshot_every,
          snapshotDraws: cfg.bandit_snapshot_draws, curveEvery: cfg.curve_grid_every,
        };
        const taskPath = cfg.task_log_seeds.includes(seed) ? resolve(dir, `tasks_${cell.id}_${sc}_s${seed}.csv.gz`) : null;
        jobs.push({ kind: 'pipeline', payload: { spec, taskPath } satisfies PipelineJob });
      }
    }
  }

  const learners = new GzCsvWriter(resolve(dir, 'learners.csv.gz'), LEARNER_COLUMNS);
  const curves = new GzCsvWriter(resolve(dir, 'bandit_curves.csv.gz'), CURVE_COLUMNS);
  const snapshots = new GzCsvWriter(resolve(dir, 'bandit_snapshots.csv.gz'), SNAPSHOT_COLUMNS);
  const runs = new GzCsvWriter(resolve(dir, 'runs.csv.gz'), RUN_COLUMNS);
  await runJobs<PipelineJobResult>(jobs, (_, r) => {
    learners.write(r.learnerCsv);
    curves.write(r.curveCsv);
    snapshots.write(r.snapshotCsv);
    runs.write(r.runCsv);
  }, { workers: opts.workers, label: 'EXP-P', quiet: opts.quiet });
  await Promise.all([learners.close(), curves.close(), snapshots.close(), runs.close()]);
  meta.write(dir);
}
