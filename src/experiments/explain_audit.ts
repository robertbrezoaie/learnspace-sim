// EXP-X, the explanation audit by replay of EXP-P task logs (SIMULATION_SPEC.md section 9.4).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAlgorithmConfig, loadExperimentConfig } from '../sim/config.ts';
import type { AuditJob, AuditResult } from '../sim/jobs.ts';
import { GzCsvWriter } from '../sim/log.ts';
import { RunMeta } from '../sim/meta.ts';
import { runJobs, type Job } from '../sim/pool.ts';
import { X1_COLUMNS, X2_COLUMNS, X3_COLUMNS, X4_COLUMNS, X4_HIST_COLUMNS } from './audit_lib.ts';
import { CONFIG_FILES, git, outDir, summaryDir, type RunOptions } from './common.ts';

interface ExplainConfig {
  source_cells: string[];
  scenario: string;
  seeds: number[];
  max_decisions_per_cell_and_output: number;
  X1_rule_comparison: { delta_tie: number };
  X2_stability: { noise_sd: number[]; delta_tie: number[]; draws_per_decision: number };
  X3_weight_sweep: { grid_step: number; delta_tie: number[]; noise_sd: number };
  X5_example_cases: { cell: string; seed: number };
}

/** Reward rows used by the X3 weight sweep (per cell; see DECISIONS.md). */
export const X3_ROWS = 10_000;

export async function runExplainExperiment(opts: RunOptions): Promise<void> {
  const g = git(opts);
  const cfg = loadExperimentConfig<ExplainConfig>('explain');
  const algo = loadAlgorithmConfig();
  const src = outDir('pipeline', opts);
  const dir = outDir('explain', opts);
  const jobs: Job[] = [];
  const x3cfg = cfg.X3_weight_sweep;
  for (const cell of cfg.source_cells) {
    const files = cfg.seeds.map((s) => resolve(src, `tasks_${cell}_${cfg.scenario}_s${s}.csv.gz`)).filter((f) => existsSync(f));
    if (files.length === 0) throw new Error(`EXP-X: no task logs for ${cell} in ${src}; run EXP-P first`);
    const base: AuditJob = {
      cell, files, algo, maxDecisions: cfg.max_decisions_per_cell_and_output, x1Tie: cfg.X1_rule_comparison.delta_tie,
      x2: { noiseSds: cfg.X2_stability.noise_sd, ties: cfg.X2_stability.delta_tie, draws: cfg.X2_stability.draws_per_decision },
      x3: cell === cfg.X5_example_cases.cell
        ? { step: x3cfg.grid_step, ties: x3cfg.delta_tie, noiseSd: x3cfg.noise_sd, draws: cfg.X2_stability.draws_per_decision, rows: X3_ROWS }
        : null,
      x5: cell === cfg.X5_example_cases.cell,
    };
    jobs.push({ kind: 'audit', payload: base });
  }
  const meta = new RunMeta('explain', g, [CONFIG_FILES.algorithm, CONFIG_FILES.experiment('explain')], { source: src, x3_rows: X3_ROWS });
  const w = {
    x1: new GzCsvWriter(resolve(dir, 'x1_rules.csv.gz'), X1_COLUMNS),
    x2: new GzCsvWriter(resolve(dir, 'x2_stability.csv.gz'), X2_COLUMNS),
    x3: new GzCsvWriter(resolve(dir, 'x3_weights.csv.gz'), X3_COLUMNS),
    x4: new GzCsvWriter(resolve(dir, 'x4_exposure.csv.gz'), X4_COLUMNS),
    x4hist: new GzCsvWriter(resolve(dir, 'x4_exposure_hist.csv.gz'), X4_HIST_COLUMNS),
  };
  const counts: Record<string, unknown> = {};
  let cases: Record<string, unknown>[] | null = null;
  await runJobs<AuditResult>(jobs, (i, r) => {
    w.x1.write(r.x1);
    w.x2.write(r.x2);
    w.x3.write(r.x3);
    w.x4.write(r.x4);
    w.x4hist.write(r.x4hist);
    counts[(jobs[i].payload as AuditJob).cell] = r.counts;
    if (r.x5) cases = r.x5;
  }, { workers: opts.workers, label: 'EXP-X', quiet: opts.quiet });
  await Promise.all(Object.values(w).map((x) => x.close()));
  writeFileSync(resolve(dir, 'audit_counts.json'), JSON.stringify(counts, null, 2) + '\n');
  const sdir = summaryDir(opts);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(
    resolve(sdir, 'example_cases.json'),
    JSON.stringify({ synthetic_data: true, source: `EXP-P cell ${cfg.X5_example_cases.cell}, scenario ${cfg.scenario}, seed ${cfg.X5_example_cases.seed}`, cases }, null, 2) + '\n',
  );
  meta.write(dir);
}
