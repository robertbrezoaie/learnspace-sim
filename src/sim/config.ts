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
