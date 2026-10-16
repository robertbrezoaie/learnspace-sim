// TS_CTX ablation (SIMULATION_SPEC.md section 6.8, decision D3): the deployed allocator with separate Beta states
// per context. Labelled a future extension; the paper's bandit is the non-contextual one.

import type { Posterior } from './allocator.ts';
import { chooseArm, initialPosterior, updatePosterior, type ArmChoice, type TsMode } from './thompson.ts';
import type { Arm, Rng } from '../types.ts';

export type BanditContext = 'novice' | 'advanced';

/** 'novice' if the mastery signal u is below the threshold at the time of the mistake, else 'advanced'. */
export function contextOf(u: number, uThreshold: number): BanditContext {
  return u < uThreshold ? 'novice' : 'advanced';
}

export function initialContextualPosterior(prior: { a: number; b: number }): Record<BanditContext, Posterior> {
  return { novice: initialPosterior(prior), advanced: initialPosterior(prior) };
}

export function chooseArmInContext(
  posteriors: Record<BanditContext, Posterior>,
  context: BanditContext,
  randomShare: number,
  mode: TsMode,
  draws: number,
  rng: Rng,
): ArmChoice {
  return chooseArm(posteriors[context], randomShare, mode, draws, rng);
}

export function updateInContext(
  posteriors: Record<BanditContext, Posterior>,
  context: BanditContext,
  arm: Arm,
  reward: 0 | 1,
): void {
  updatePosterior(posteriors[context], arm, reward);
}
