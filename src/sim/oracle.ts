// Hidden-state view (SIMULATION_SPEC.md section 8.4). Only the ORACLE policy and metric code may use it.
// The engine sets the true retry probabilities of the current mistake before asking the policy for an arm.

import type { ArmChoice } from '../core/bandit/thompson.ts';
import { ARMS, type Arm } from '../core/types.ts';
import type { ArmValues } from './learner.ts';
import type { FeedbackPolicy } from './policies.ts';

export class OracleView {
  current: ArmValues = { plain: 0, hint: 0, example: 0 };
}

/** ORACLE: argmax_a pi_a for this mistake (ties keep the order plain, hint, example). */
export function makeOraclePolicy(view: OracleView): FeedbackPolicy {
  return {
    name: 'ORACLE',
    lastChoice: null as ArmChoice | null,
    choose(): Arm {
      let best: Arm = ARMS[0];
      for (const a of ARMS) if (view.current[a] > view.current[best]) best = a;
      return best;
    },
    update(): void {},
    posteriors: () => null,
  };
}
