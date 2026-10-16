// Feedback policies (SIMULATION_SPEC.md section 8.3). None of these sees hidden learner state:
// they receive only an ObservableContext. ORACLE is built in oracle.ts.

import type { ArmProbs, Posterior } from '../core/bandit/allocator.ts';
import { estimateThompsonProbs } from '../core/bandit/allocator.ts';
import {
  chooseArmInContext,
  contextOf,
  initialContextualPosterior,
  updateInContext,
  type BanditContext,
} from '../core/bandit/contextual.ts';
import { chooseArm, initialPosterior, updatePosterior, type ArmChoice, type TsMode } from '../core/bandit/thompson.ts';
import { ARMS, type AlgorithmConfig, type Arm, type Rng, type Signals } from '../core/types.ts';

export type PolicyName =
  | 'PLAIN'
  | 'RANDOM'
  | 'FIXED_HINT'
  | 'FIXED_EXAMPLE'
  | 'TS_DEPLOYED'
  | 'TS_PURE'
  | 'TS_CTX'
  | 'ORACLE';

/** What a policy may see at the time of a mistake. */
export interface ObservableContext {
  signals: Signals; // signals from the learner's observations before this task
}

export interface FeedbackPolicy {
  readonly name: PolicyName;
  choose(ctx: ObservableContext): Arm;
  update(arm: Arm, reward: 0 | 1, ctx: ObservableContext): void;
  /** Details of the last choice (TS policies in 'probs' mode log propensities). */
  lastChoice: ArmChoice | null;
  /** Thompson state for snapshots; null for non-bandit policies. */
  posteriors(): Record<string, Posterior> | null;
}

class FixedPolicy implements FeedbackPolicy {
  lastChoice: ArmChoice | null = null;
  readonly name: PolicyName;
  private readonly arm: Arm;
  constructor(name: PolicyName, arm: Arm) {
    this.name = name;
    this.arm = arm;
  }
  choose(): Arm {
    return this.arm;
  }
  update(): void {}
  posteriors(): null {
    return null;
  }
}

class RandomPolicy implements FeedbackPolicy {
  readonly name = 'RANDOM';
  lastChoice: ArmChoice | null = null;
  private readonly rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
  }
  choose(): Arm {
    return ARMS[Math.floor(this.rng.next() * ARMS.length)];
  }
  update(): void {}
  posteriors(): null {
    return null;
  }
}

/** The deployed allocator: one global Beta state shared by all learners in the run. */
class ThompsonPolicy implements FeedbackPolicy {
  lastChoice: ArmChoice | null = null;
  private readonly posterior: Posterior;
  readonly name: PolicyName;
  private readonly randomShare: number;
  private readonly mode: TsMode;
  private readonly draws: number;
  private readonly rng: Rng;
  constructor(name: PolicyName, randomShare: number, mode: TsMode, draws: number, prior: { a: number; b: number }, rng: Rng) {
    this.name = name;
    this.randomShare = randomShare;
    this.mode = mode;
    this.draws = draws;
    this.rng = rng;
    this.posterior = initialPosterior(prior);
  }
  choose(): Arm {
    this.lastChoice = chooseArm(this.posterior, this.randomShare, this.mode, this.draws, this.rng);
    return this.lastChoice.arm;
  }
  update(arm: Arm, reward: 0 | 1): void {
    updatePosterior(this.posterior, arm, reward);
  }
  posteriors(): Record<string, Posterior> {
    return { global: this.posterior };
  }
}

/** TS_CTX ablation: separate states for 'novice' (u < threshold) and 'advanced' learners. */
class ContextualThompsonPolicy implements FeedbackPolicy {
  readonly name = 'TS_CTX';
  lastChoice: ArmChoice | null = null;
  private readonly state: Record<BanditContext, Posterior>;
  private readonly randomShare: number;
  private readonly mode: TsMode;
  private readonly draws: number;
  private readonly uThreshold: number;
  private readonly rng: Rng;
  constructor(randomShare: number, mode: TsMode, draws: number, uThreshold: number, prior: { a: number; b: number }, rng: Rng) {
    this.randomShare = randomShare;
    this.mode = mode;
    this.draws = draws;
    this.uThreshold = uThreshold;
    this.rng = rng;
    this.state = initialContextualPosterior(prior);
  }
  choose(ctx: ObservableContext): Arm {
    const c = contextOf(ctx.signals.u, this.uThreshold);
    this.lastChoice = chooseArmInContext(this.state, c, this.randomShare, this.mode, this.draws, this.rng);
    return this.lastChoice.arm;
  }
  update(arm: Arm, reward: 0 | 1, ctx: ObservableContext): void {
    updateInContext(this.state, contextOf(ctx.signals.u, this.uThreshold), arm, reward);
  }
  posteriors(): Record<string, Posterior> {
    return { novice: this.state.novice, advanced: this.state.advanced };
  }
}

/** Builds every policy except ORACLE (which needs an OracleView; see oracle.ts). */
export function makePolicy(name: Exclude<PolicyName, 'ORACLE'>, cfg: AlgorithmConfig['bandit'], mode: TsMode, rng: Rng): FeedbackPolicy {
  switch (name) {
    case 'PLAIN':
      return new FixedPolicy('PLAIN', 'plain');
    case 'FIXED_HINT':
      return new FixedPolicy('FIXED_HINT', 'hint');
    case 'FIXED_EXAMPLE':
      return new FixedPolicy('FIXED_EXAMPLE', 'example');
    case 'RANDOM':
      return new RandomPolicy(rng);
    case 'TS_DEPLOYED':
      return new ThompsonPolicy('TS_DEPLOYED', cfg.random_share, mode, cfg.draws, cfg.prior, rng);
    case 'TS_PURE':
      return new ThompsonPolicy('TS_PURE', 0, mode, cfg.draws, cfg.prior, rng);
    case 'TS_CTX':
      return new ContextualThompsonPolicy(cfg.random_share, mode, cfg.draws, cfg.ctx.u_threshold, cfg.prior, rng);
  }
}

/** probsTS of a posterior, for snapshots (uses its own RNG stream so it never disturbs the policy). */
export function snapshotProbs(posterior: Posterior, draws: number, rng: Rng): ArmProbs {
  return estimateThompsonProbs(posterior, draws, rng);
}
