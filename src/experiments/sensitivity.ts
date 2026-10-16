// EXP-S, one-at-a-time sensitivity analysis (SIMULATION_SPEC.md section 9.5).

import { resolve } from 'node:path';
import { learnerParamEntries, loadAlgorithmConfig, loadExperimentConfig, loadLearnerParams, loadScenarios, type LearnerParams } from '../sim/config.ts';
import type { RunSpec } from '../sim/engine.ts';
import { RUN_SUMMARY_COLUMNS, type SensitivityJob, type SensitivityResult } from '../sim/jobs.ts';
import { GzCsvWriter } from '../sim/log.ts';
import { RunMeta } from '../sim/meta.ts';
import { runJobs, type Job } from '../sim/pool.ts';
import { X1_COLUMNS, X2_COLUMNS } from './audit_lib.ts';
import { CONFIG_FILES, git, outDir, seedRange, type RunOptions } from './common.ts';
import type { PipelineConfig } from './pipeline.ts';

interface SensitivityConfig {
  N: number;
  seeds: { from: number; to: number };
  runs: { scenario: string; cells: string[] }[];
  explain: { cell: string; scenario: string; seeds: number[]; noise_sd: number; delta_tie: number[] };
}

const SETTING_COLUMNS = ['setting', 'param', 'level', 'value'];

export async function runSensitivityExperiment(opts: RunOptions, over: { params?: string[] } = {}): Promise<void> {
  const g = git(opts);
  const cfg = loadExperimentConfig<SensitivityConfig>('sensitivity');
  const pipe = loadExperimentConfig<PipelineConfig>('pipeline');
  const explainCfg = loadExperimentConfig<{ max_decisions_per_cell_and_output: number; X2_stability: { draws_per_decision: number } }>('explain');
  const algo = loadAlgorithmConfig();
  const scenarios = loadScenarios();
  const N = opts.quick ? pipe.quick.N : cfg.N;
  const seeds = opts.quick ? seedRange(pipe.quick.seeds) : seedRange(cfg.seeds);
  const cells = Object.fromEntries(pipe.cells.map((c) => [c.id, c]));

  const settings: { setting: string; param: string; level: string; value: number | null; overrides: Partial<LearnerParams> }[] = [
    { setting: 'default', param: 'default', level: 'default', value: null, overrides: {} },
  ];
  for (const e of learnerParamEntries()) {
    if (!e.range) continue;
    if (over.params && !over.params.includes(e.name)) continue;
    settings.push({ setting: `${e.name}=low`, param: e.name, level: 'low', value: e.range[0], overrides: { [e.name]: e.range[0] } });
    settings.push({ setting: `${e.name}=high`, param: e.name, level: 'high', value: e.range[1], overrides: { [e.name]: e.range[1] } });
  }

  const jobs: Job[] = [];
  for (const st of settings) {
    const lp = loadLearnerParams({ ...st.overrides, N });
    for (const seed of seeds) {
      const spec = (cellId: string, sc: string): RunSpec => ({
        cell: cellId, difficulty: cells[cellId].difficulty, policy: cells[cellId].policy, scenario: scenarios[sc], seed,
        algo, learner: lp, tsMode: pipe.ts_mode, logTasks: false, snapshotEvery: Number.MAX_SAFE_INTEGER,
        snapshotDraws: 0, curveEvery: pipe.curve_grid_every,
      });
      const runs = cfg.runs.flatMap((r) => r.cells.map((c) => spec(c, r.scenario)));
      const ex = cfg.explain;
      const explain = ex.seeds.includes(seed)
        ? {
            cell: ex.cell, spec: spec(ex.cell, ex.scenario), algo, maxDecisions: explainCfg.max_decisions_per_cell_and_output,
            x1Tie: algo.explanation.delta_tie,
            x2: { noiseSds: [ex.noise_sd], ties: ex.delta_tie, draws: explainCfg.X2_stability.draws_per_decision },
            x3: null, x5: false,
          }
        : null;
      jobs.push({ kind: 'sensitivity', payload: { setting: st.setting, param: st.param, level: st.level, value: st.value, seed, runs, explain } satisfies SensitivityJob });
    }
  }

  const dir = outDir('sensitivity', opts);
  const meta = new RunMeta('sensitivity', g, [CONFIG_FILES.algorithm, CONFIG_FILES.learner, CONFIG_FILES.scenarios, CONFIG_FILES.experiment('sensitivity')], {
    quick: opts.quick, N, seeds, settings: settings.map((s) => s.setting),
  });
  const runsW = new GzCsvWriter(resolve(dir, 'runs.csv.gz'), RUN_SUMMARY_COLUMNS);
  const x1W = new GzCsvWriter(resolve(dir, 'x1_rules.csv.gz'), [...SETTING_COLUMNS, ...X1_COLUMNS]);
  const x2W = new GzCsvWriter(resolve(dir, 'x2_stability.csv.gz'), [...SETTING_COLUMNS, ...X2_COLUMNS]);
  await runJobs<SensitivityResult>(jobs, (_, r) => {
    runsW.write(r.runs);
    x1W.write(r.x1);
    x2W.write(r.x2);
  }, { workers: opts.workers, label: 'EXP-S', quiet: opts.quiet });
  await Promise.all([runsW.close(), x1W.close(), x2W.close()]);
  meta.write(dir);
}
