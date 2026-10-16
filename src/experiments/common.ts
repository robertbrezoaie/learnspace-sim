// Shared helpers of the experiment drivers.

import { resolve } from 'node:path';
import type { DifficultyRule } from '../core/difficulty.ts';
import { CONFIG_DIR } from '../sim/config.ts';
import { REPO_ROOT, checkGit, type GitState } from '../sim/meta.ts';
import type { PolicyName } from '../sim/policies.ts';

export interface RunOptions {
  quick: boolean;
  fast: boolean;
  allowDirty: boolean;
  workers?: number;
  quiet?: boolean;
  /** Overrides the output root (tests). */
  outRoot?: string;
}

export interface CellDef {
  id: string;
  difficulty: DifficultyRule;
  policy: PolicyName;
  scenarios: string[];
}

export function outDir(exp: string, opts: RunOptions): string {
  if (opts.outRoot) return resolve(opts.outRoot, exp);
  return resolve(REPO_ROOT, 'results', opts.quick ? 'quick' : 'raw', exp);
}

export function summaryDir(opts: RunOptions): string {
  if (opts.outRoot) return resolve(opts.outRoot, 'summary');
  return resolve(REPO_ROOT, 'results', opts.quick ? 'quick/summary' : 'summary');
}

export function git(opts: RunOptions): GitState & { publishable: boolean } {
  return checkGit(opts.allowDirty || opts.outRoot !== undefined);
}

export function seedRange(r: { from: number; to: number }): number[] {
  return Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i);
}

export const CONFIG_FILES = {
  algorithm: resolve(CONFIG_DIR, 'algorithm.default.json'),
  learner: resolve(CONFIG_DIR, 'learner.default.json'),
  scenarios: resolve(CONFIG_DIR, 'scenarios.json'),
  experiment: (name: string) => resolve(CONFIG_DIR, 'experiments', `${name}.json`),
};
