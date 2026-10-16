// Job handlers run by pool.ts (inline or in worker threads). Every handler is deterministic given its payload.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  auditX1,
  auditX2,
  auditX3,
  auditX4,
  difficultyDecisions,
  exampleCases,
  parseTasks,
  rewardDecisions,
  sampleInOrder,
  type TaskRecord,
} from '../experiments/audit_lib.ts';
import type { AlgorithmConfig } from '../core/types.ts';
import { LEARNER_COLUMNS, RUN_COLUMNS, TASK_COLUMNS, runPipeline, type RunResult, type RunSpec } from './engine.ts';
import { runField, type FieldResult, type FieldSpec } from './field.ts';
import { csvLine, writeGzipFile } from './log.ts';
import { stream } from './rng.ts';

export type JobKind = 'pipeline' | 'field' | 'audit' | 'sensitivity';

// ---------- pipeline ----------

export interface PipelineJob {
  spec: RunSpec;
  taskPath: string | null;
}

export type PipelineJobResult = Omit<RunResult, 'taskCsv'>;

function pipelineJob(job: PipelineJob): PipelineJobResult {
  const r = runPipeline({ ...job.spec, logTasks: job.taskPath !== null });
  if (job.taskPath !== null) writeGzipFile(job.taskPath, TASK_COLUMNS.join(',') + '\n' + r.taskCsv);
  return { learnerCsv: r.learnerCsv, curveCsv: r.curveCsv, snapshotCsv: r.snapshotCsv, runCsv: r.runCsv };
}

// ---------- explanation audit ----------

export interface AuditJob {
  cell: string;
  files: string[];
  algo: AlgorithmConfig;
  maxDecisions: number;
  x1Tie: number;
  x2: { noiseSds: number[]; ties: number[]; draws: number };
  x3: { step: number; ties: number[]; noiseSd: number; draws: number; rows: number } | null;
  x5: boolean;
}

export interface AuditResult {
  x1: string;
  x2: string;
  x3: string;
  x4: string;
  x4hist: string;
  x5: Record<string, unknown>[] | null;
  counts: { rows: number; reward: number; difficulty: number; reward_sampled: number; difficulty_sampled: number; suppressed_by_clip: number };
}

function auditJob(job: AuditJob): AuditResult {
  const recs: TaskRecord[] = [];
  for (const f of job.files) recs.push(...parseTasks(gunzipSync(readFileSync(f)).toString('utf8')));
  return auditRecords(job, recs);
}

export function auditRecords(job: Omit<AuditJob, 'files'>, recs: TaskRecord[]): AuditResult {
  const { cell, algo } = job;
  const allReward = rewardDecisions(recs);
  const allDiff = difficultyDecisions(recs);
  const reward = sampleInOrder(allReward, job.maxDecisions, stream(1, `xaudit:${cell}:reward`));
  const diff = sampleInOrder(allDiff, job.maxDecisions, stream(1, `xaudit:${cell}:difficulty`));
  const both = [...reward, ...diff];
  const x1 = auditX1(cell, both, algo, job.x1Tie);
  const x2 = auditX2(cell, both, algo, job.x2.noiseSds, job.x2.ties, job.x2.draws, stream(1, `xnoise:${cell}`));
  let x3 = '';
  if (job.x3) {
    const rows = sampleInOrder(recs, job.x3.rows, stream(1, `xaudit:${cell}:x3`));
    x3 = auditX3(cell, rows, algo, job.x3.step, job.x3.ties, job.x3.noiseSd, job.x3.draws, stream(1, `xnoise3:${cell}`));
  }
  const x4 = auditX4(cell, recs);
  return {
    x1,
    x2,
    x3,
    x4: x4.summary,
    x4hist: x4.hist,
    x5: job.x5 ? exampleCases(recs.filter((r) => r.seed === Math.min(...recs.map((q) => q.seed))), algo) : null,
    counts: {
      rows: recs.length,
      reward: allReward.length,
      difficulty: allDiff.length,
      reward_sampled: reward.length,
      difficulty_sampled: diff.length,
      suppressed_by_clip: recs.filter((r) => r.suppressed).length,
    },
  };
}

// ---------- sensitivity ----------

export const RUN_SUMMARY_COLUMNS = [
  'setting', 'param', 'level', 'value', 'cell', 'scenario', 'seed', 'N', 'TIB', 'FAS', 'RTS', 'TASKS', 'CHURN',
  'QUIT', 'E_mean', 'FRUS', 'BORE', 'delta_theta', 'decisions', 'REG_oracle', 'REG_fixed', 'VAL',
] as const;

/** Run-level means over learners (learners without a value for a metric are skipped for that metric). */
export function summariseRun(learnerCsv: string, runCsv: string): Record<string, number> {
  const col = (name: string) => LEARNER_COLUMNS.indexOf(name as (typeof LEARNER_COLUMNS)[number]);
  const rows = learnerCsv.trimEnd().split('\n').map((l) => l.split(','));
  const avg = (name: string, f: (v: number, row: string[]) => number = (v) => v) => {
    const j = col(name);
    let s = 0;
    let n = 0;
    for (const r of rows) {
      if (r[j] === '') continue;
      s += f(Number(r[j]), r);
      n++;
    }
    return n ? s / n : NaN;
  };
  const run = runCsv.trimEnd().split(',');
  const rc = (name: string) => Number(run[RUN_COLUMNS.indexOf(name as (typeof RUN_COLUMNS)[number])]);
  return {
    TIB: avg('TIB'),
    FAS: avg('FAS'),
    RTS: avg('RTS'),
    TASKS: avg('tasks'),
    CHURN: avg('churned'),
    QUIT: avg('quits', (q, r) => (Number(r[col('sessions_attended')]) ? q / Number(r[col('sessions_attended')]) : 0)),
    E_mean: avg('E_mean'),
    FRUS: avg('FRUS'),
    BORE: avg('BORE'),
    delta_theta: avg('delta_theta'),
    decisions: rc('decisions'),
    REG_oracle: rc('REG_oracle'),
    REG_fixed: rc('REG_fixed'),
    VAL: rc('VAL'),
  };
}

export interface SensitivityJob {
  setting: string;
  param: string;
  level: string;
  value: number | null;
  seed: number;
  runs: RunSpec[];
  explain: Omit<AuditJob, 'files' | 'cell'> & { cell: string; spec: RunSpec } | null;
}

export interface SensitivityResult {
  runs: string;
  x1: string;
  x2: string;
}

function sensitivityJob(job: SensitivityJob): SensitivityResult {
  let runs = '';
  const prefix = [job.setting, job.param, job.level, job.value] as const;
  for (const spec of job.runs) {
    const r = runPipeline({ ...spec, logTasks: false });
    const s = summariseRun(r.learnerCsv, r.runCsv);
    runs += csvLine([...prefix, spec.cell, spec.scenario.id, spec.seed, spec.learner.N, s.TIB, s.FAS, s.RTS, s.TASKS,
      s.CHURN, s.QUIT, s.E_mean, s.FRUS, s.BORE, s.delta_theta, s.decisions, s.REG_oracle, s.REG_fixed, s.VAL]);
  }
  let x1 = '';
  let x2 = '';
  if (job.explain) {
    const r = runPipeline({ ...job.explain.spec, logTasks: true });
    const recs = parseTasks(TASK_COLUMNS.join(',') + '\n' + r.taskCsv);
    const a = auditRecords({ ...job.explain, x3: null, x5: false }, recs);
    const pre = (text: string) => text.split('\n').filter((l) => l).map((l) => `${job.setting},${job.param},${job.level},${job.value ?? ''},${l}\n`).join('');
    x1 = pre(a.x1);
    x2 = pre(a.x2);
  }
  return { runs, x1, x2 };
}

// ---------- dispatch ----------

export async function handle(kind: JobKind, payload: unknown): Promise<unknown> {
  switch (kind) {
    case 'pipeline':
      return pipelineJob(payload as PipelineJob);
    case 'field':
      return runField(payload as FieldSpec) satisfies FieldResult;
    case 'audit':
      return auditJob(payload as AuditJob);
    case 'sensitivity':
      return sensitivityJob(payload as SensitivityJob);
  }
}
