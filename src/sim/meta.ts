// Run metadata (SIMULATION_SPEC.md section 5.3). Wall-clock time is recorded here only; it never enters a simulation.

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { CONFIG_DIR } from './config.ts';

export const REPO_ROOT = resolve(CONFIG_DIR, '..');

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export interface GitState {
  sha: string | null;
  dirty: boolean;
}

export function gitState(): GitState {
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const status = execSync('git status --porcelain', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return { sha, dirty: status.trim().length > 0 };
  } catch {
    return { sha: null, dirty: true };
  }
}

/** Refuses to run on a dirty working tree unless allowDirty; returns whether outputs are publishable. */
export function checkGit(allowDirty: boolean): GitState & { publishable: boolean } {
  const g = gitState();
  if (g.dirty && !allowDirty) {
    throw new Error('The git working tree is dirty (or not a repository). Commit first, or pass --allow-dirty (outputs are then non-publishable).');
  }
  return { ...g, publishable: !g.dirty };
}

export class RunMeta {
  private readonly started = new Date();
  private readonly experiment: string;
  private readonly git: GitState & { publishable: boolean };
  private readonly configFiles: string[];
  private readonly extra: Record<string, unknown>;
  constructor(experiment: string, git: GitState & { publishable: boolean }, configFiles: string[], extra: Record<string, unknown>) {
    this.experiment = experiment;
    this.git = git;
    this.configFiles = configFiles;
    this.extra = extra;
  }

  write(outDir: string): void {
    const ended = new Date();
    const meta = {
      experiment: this.experiment,
      synthetic_data: true,
      note: 'All data are synthetic (simulated learners). The simulation validates algorithmic behaviour, not learning outcomes.',
      git_commit: this.git.sha,
      git_dirty: this.git.dirty,
      publishable: this.git.publishable,
      config_sha256: Object.fromEntries(this.configFiles.map((f) => [relative(REPO_ROOT, f), sha256File(f)])),
      node_version: process.version,
      started: this.started.toISOString(),
      ended: ended.toISOString(),
      duration_seconds: (ended.getTime() - this.started.getTime()) / 1000,
      ...this.extra,
    };
    const path = resolve(outDir, 'run_meta.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(meta, null, 2) + '\n');
  }
}
