// Loading of configs/*.json. Keys starting with '_' are documentation; code never reads them.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlgorithmConfig } from '../core/types.ts';

export const CONFIG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../configs');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`config: ${name} must be a finite number`);
  return value;
}

export function loadAlgorithmConfig(path = resolve(CONFIG_DIR, 'algorithm.default.json')): AlgorithmConfig {
  const cfg = readJson(path) as AlgorithmConfig;
  const { alpha, beta, gamma } = cfg.reward;
  for (const [name, w] of Object.entries({ alpha, beta, gamma })) {
    if (requireNumber(w, `reward.${name}`) < 0) throw new Error(`config: reward.${name} must be >= 0`);
  }
  if (Math.abs(alpha + beta + gamma - 1) > 1e-9) throw new Error('config: alpha + beta + gamma must equal 1');
  requireNumber(cfg.signals.N_u, 'signals.N_u');
  requireNumber(cfg.difficulty.eps_D, 'difficulty.eps_D');
  requireNumber(cfg.explanation.delta_tie, 'explanation.delta_tie');
  if (cfg.bandit.ts_mode !== 'sample' && cfg.bandit.ts_mode !== 'probs') throw new Error('config: bandit.ts_mode');
  return cfg;
}

/** Values of configs/learner.default.json, flattened by parameter name (section 7.7). */
export interface LearnerParams {
  N: number;
  S: number;
  T: number;
  mu_theta: number;
  sigma_theta: number;
  rt_baseline_seconds: number;
  rt_baseline_sd_log: number;
  E_star_mean: number;
  E_star_concentration: number;
  s_D: number;
  guess: number;
  slip: number;
  sigma_rt: number;
  lambda_d: number;
  dk0: number;
  dk1: number;
  dk2: number;
  dk_scale: number;
  dk_max: number;
  dk_rt_factor: number;
  l_p: number;
  l_r: number;
  rho: number;
  rho_s: number;
  phi_flow: number;
  phi_bore: number;
  phi_frus: number;
  band_lo: number;
  band_hi: number;
  band_shift: number;
  p_bore: number;
  E_q: number;
  q_max: number;
  a0: number;
  a1: number;
  attend_max: number;
  absences_to_churn: number;
  grader_error: number;
  gain_scale: number;
  gain_clip_low: number;
  gain_clip_high: number;
}

export interface LearnerParamEntry {
  name: keyof LearnerParams;
  group: string;
  value: number;
  range: [number, number] | null;
  source: string;
}

/** Every parameter entry of the learner config, in file order. */
export function learnerParamEntries(path = resolve(CONFIG_DIR, 'learner.default.json')): LearnerParamEntry[] {
  const raw = readJson(path) as Record<string, unknown>;
  const out: LearnerParamEntry[] = [];
  for (const [group, entries] of Object.entries(raw)) {
    if (group.startsWith('_')) continue;
    for (const [name, e] of Object.entries(entries as Record<string, unknown>)) {
      if (name.startsWith('_')) continue;
      const entry = e as { value: number; range: [number, number] | null; source: string };
      out.push({
        name: name as keyof LearnerParams,
        group,
        value: requireNumber(entry.value, `${group}.${name}.value`),
        range: entry.range,
        source: entry.source,
      });
    }
  }
  return out;
}

/** Learner parameter values, optionally with overrides (EXP-S settings, experiment sizes). */
export function loadLearnerParams(overrides: Partial<LearnerParams> = {}, path?: string): LearnerParams {
  const values: Record<string, number> = {};
  for (const e of learnerParamEntries(path)) values[e.name] = e.value;
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in values)) throw new Error(`config: unknown learner parameter ${k}`);
    values[k] = v as number;
  }
  return values as unknown as LearnerParams;
}

export interface ArmGain {
  intercept: number;
  slope: number;
}

export interface Scenario {
  id: string;
  label: string;
  hint: ArmGain;
  example: ArmGain;
}

export function loadScenarios(path = resolve(CONFIG_DIR, 'scenarios.json')): Record<string, Scenario> {
  const raw = readJson(path) as { scenarios: Record<string, Omit<Scenario, 'id'>> };
  const out: Record<string, Scenario> = {};
  for (const [id, s] of Object.entries(raw.scenarios)) out[id] = { id, ...s };
  return out;
}

export function loadExperimentConfig<T = Record<string, unknown>>(name: string): T {
  return readJson(resolve(CONFIG_DIR, 'experiments', `${name}.json`)) as T;
}
