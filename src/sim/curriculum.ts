// Curriculum (SIMULATION_SPEC.md sections 6.5 and 9.3): the semester's base difficulty and the field-study tiers.

export { curriculumBase } from '../core/difficulty.ts';

export type Tier = 'warmup' | 'easy' | 'hard';

export interface TierDeltas {
  warmup: number;
  easy: number;
  hard: number;
}

/** Difficulty logits of the field-study question sequence, in tier order. */
export function fieldSequence(order: readonly Tier[], deltas: TierDeltas): { tier: Tier; delta: number }[] {
  return order.map((tier) => ({ tier, delta: deltas[tier] }));
}
