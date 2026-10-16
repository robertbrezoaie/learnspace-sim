// Experience points per task (SIMULATION_SPEC.md section 6.3, paper Eq. 1).
// The social term of Eq. 1 is omitted: the simulation has no social interaction. XP is logged, not evaluated.

import type { AlgorithmConfig } from './types.ts';

/** XP_t = round((baseXP + difficultyMultiplier * D) * m) if the task was solved (first attempt or retry), else 0. */
export function taskXP(
  solved: boolean,
  difficulty: number,
  multiplier: number,
  cfg: AlgorithmConfig['gamification'],
): number {
  if (!solved) return 0;
  return Math.round((cfg.baseXP + cfg.difficultyMultiplier * difficulty) * multiplier);
}
