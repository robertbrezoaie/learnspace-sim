// Reward modulation (SIMULATION_SPEC.md section 6.4, paper Eq. 3, typed and bounded).

import { clip, type AlgorithmConfig, type Contributions, type Signals } from './types.ts';

export interface RewardDecision {
  contributions: Contributions; // { u: alpha*u, b: beta*b, e: gamma*e }
  aiReward: number; // sum of the contributions, in [-1, 1]; also the decision value used for explanations
  multiplier: number; // m = clip(1 + lambda_r * aiReward, m_min, m_max)
}

export function rewardDecision(signals: Signals, cfg: AlgorithmConfig['reward']): RewardDecision {
  const contributions = {
    u: cfg.alpha * signals.u,
    b: cfg.beta * signals.b,
    e: cfg.gamma * signals.e,
  };
  const aiReward = contributions.u + contributions.b + contributions.e;
  const multiplier = clip(1 + cfg.lambda_r * aiReward, cfg.m_min, cfg.m_max);
  return { contributions, aiReward, multiplier };
}
