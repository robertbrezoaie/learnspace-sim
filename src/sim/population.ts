// Hidden learner traits (SIMULATION_SPEC.md section 7.1), drawn once per learner from stream "pop".
// For a given seed every condition gets the same population (common random numbers, section 5.2).

import type { LearnerParams } from './config.ts';
import { stream } from './rng.ts';

export interface LearnerTraits {
  theta0: number; // ability on the logit scale
  muRt: number; // personal baseline of log response time (seconds)
  Estar: number; // trait engagement
}

export function drawPopulation(n: number, seed: number, p: LearnerParams): LearnerTraits[] {
  const rng = stream(seed, 'pop');
  const out: LearnerTraits[] = [];
  const c = p.E_star_concentration;
  for (let i = 0; i < n; i++) {
    const theta0 = p.mu_theta + p.sigma_theta * rng.normal();
    const muRt = Math.log(p.rt_baseline_seconds) + p.rt_baseline_sd_log * rng.normal();
    const Estar = rng.beta(c * p.E_star_mean, c * (1 - p.E_star_mean));
    out.push({ theta0, muRt, Estar });
  }
  return out;
}
