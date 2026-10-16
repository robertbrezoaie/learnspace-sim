// Hidden learner model (SIMULATION_SPEC.md section 7). It is hidden from the algorithm; it only produces observations.
// Every random draw is always consumed, even when its result is not needed, so that the k-th event of a learner
// uses the same random numbers in every condition (common random numbers).

import { ARMS, clip, type Arm } from '../core/types.ts';
import type { LearnerParams, Scenario } from './config.ts';
import type { LearnerTraits } from './population.ts';
import { stream, type SimRng } from './rng.ts';

export type ArmValues = Record<Arm, number>;

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Gains in logits at relative expertise x = theta - delta, clipped then scaled (section 7.4). plain = 0. */
export function armGains(scenario: Scenario, x: number, p: LearnerParams): ArmValues {
  const g = (a: { intercept: number; slope: number }) =>
    clip(a.intercept + a.slope * x, p.gain_clip_low, p.gain_clip_high) * p.gain_scale;
  return { plain: 0, hint: g(scenario.hint), example: g(scenario.example) };
}

/** True success probability g + (1 - g - s) * sigma(z). */
export function successProbability(z: number, p: LearnerParams): number {
  return p.guess + (1 - p.guess - p.slip) * logistic(z);
}

/** "Don't know" probability. */
export function dontKnowProbability(E: number, P: number, p: LearnerParams): number {
  return clip(p.dk_scale * (p.dk0 + p.dk1 * (1 - E) + p.dk2 * (1 - P)), 0, p.dk_max);
}

/** Expected first-attempt success, "don't know" included: (1 - q_dk) * P. */
export function expectedSuccess(theta: number, delta: number, E: number, p: LearnerParams): number {
  const P = successProbability(theta - delta, p);
  return (1 - dontKnowProbability(E, P, p)) * P;
}

export interface TaskOutcome {
  delta: number;
  P: number; // true first-attempt success probability (hidden)
  dontKnow: boolean;
  correct: boolean; // true correctness (hidden)
  observedCorrect: boolean; // graded result
  rtSeconds: number;
  arm: Arm | null;
  pi: ArmValues | null; // true retry success per arm (hidden)
  retryDontKnow: boolean | null;
  retryCorrect: boolean | null; // true (hidden)
  observedRetry: boolean | null; // graded
}

export class Learner {
  theta: number;
  E: number;
  streak = 0; // current run of unrecovered mistakes
  absences = 0; // consecutive absences
  churned = false;
  private readonly attendRng: SimRng;
  private readonly attemptRng: SimRng;
  private readonly retryRng: SimRng;
  private readonly rtRng: SimRng;
  private readonly dkRng: SimRng;
  private readonly quitRng: SimRng;
  private readonly graderRng: SimRng;
  readonly id: number;
  readonly traits: LearnerTraits;
  private readonly p: LearnerParams;
  private readonly scenario: Scenario;

  constructor(id: number, traits: LearnerTraits, p: LearnerParams, scenario: Scenario, seed: number) {
    this.id = id;
    this.traits = traits;
    this.p = p;
    this.scenario = scenario;
    this.theta = traits.theta0;
    this.E = traits.Estar;
    this.attendRng = stream(seed, `learner:${id}:attend`);
    this.attemptRng = stream(seed, `learner:${id}:attempt`);
    this.retryRng = stream(seed, `learner:${id}:retry`);
    this.rtRng = stream(seed, `learner:${id}:rt`);
    this.dkRng = stream(seed, `learner:${id}:dk`);
    this.quitRng = stream(seed, `learner:${id}:quit`);
    this.graderRng = stream(seed, `learner:${id}:grader`);
  }

  /** Weekly attendance draw (section 7.5). */
  attends(): boolean {
    return this.attendRng.next() < clip(this.p.a0 + this.p.a1 * this.E, 0, this.p.attend_max);
  }

  /** Engagement recovery once per elapsed week. */
  weeklyRecovery(): void {
    this.E += this.p.rho_s * (this.traits.Estar - this.E);
  }

  /**
   * One task at difficulty logit delta (section 7.2). After an observed mistake, chooseArm is called with the
   * true retry probabilities; only the ORACLE policy may look at them.
   */
  doTask(delta: number, chooseArm: (pi: ArmValues) => Arm): TaskOutcome {
    const p = this.p;
    const P = successProbability(this.theta - delta, p);
    const qDk = dontKnowProbability(this.E, P, p);
    const dontKnow = this.dkRng.next() < qDk;
    const correctDraw = this.attemptRng.next() < P;
    const correct = !dontKnow && correctDraw;
    let rtSeconds = Math.exp(this.traits.muRt + p.lambda_d * (delta - this.theta) + p.sigma_rt * this.rtRng.normal());
    if (dontKnow) rtSeconds *= p.dk_rt_factor;
    const flip = this.graderRng.next() < p.grader_error;
    const observedCorrect = dontKnow ? false : correct !== flip;

    const outcome: TaskOutcome = {
      delta,
      P,
      dontKnow,
      correct,
      observedCorrect,
      rtSeconds,
      arm: null,
      pi: null,
      retryDontKnow: null,
      retryCorrect: null,
      observedRetry: null,
    };
    if (!observedCorrect) {
      const x = this.theta - delta;
      const gains = armGains(this.scenario, x, p);
      const pi = {} as ArmValues;
      for (const a of ARMS) pi[a] = successProbability(x + gains[a], p);
      const arm = chooseArm(pi);
      const retryDontKnow = this.dkRng.next() < qDk;
      const retryDraw = this.retryRng.next() < pi[arm];
      const retryCorrect = !retryDontKnow && retryDraw;
      const retryFlip = this.graderRng.next() < p.grader_error;
      outcome.arm = arm;
      outcome.pi = pi;
      outcome.retryDontKnow = retryDontKnow;
      outcome.retryCorrect = retryCorrect;
      outcome.observedRetry = retryDontKnow ? false : retryCorrect !== retryFlip;
    }
    return outcome;
  }

  /** Learning (section 7.3). */
  learn(o: TaskOutcome): void {
    if (!o.dontKnow) this.theta += this.p.l_p;
    if (o.retryCorrect) this.theta += this.p.l_r;
  }

  /**
   * Engagement update from observed outcomes, then the quit draw (section 7.5).
   * Returns true if the learner quits the session. The quit draw is consumed only when quitting is possible.
   */
  updateEngagement(o: TaskOutcome, lastPlannedTask: boolean): boolean {
    const p = this.p;
    this.E += p.rho * (this.traits.Estar - this.E);
    if (o.observedCorrect) {
      this.streak = 0;
      if (p.band_lo + p.band_shift <= o.P && o.P <= p.band_hi + p.band_shift) this.E += p.phi_flow;
      else if (o.P > p.p_bore) this.E -= p.phi_bore;
    } else if (o.observedRetry) {
      this.streak = 0;
      this.E -= p.phi_frus / 3;
    } else {
      this.streak += 1;
      this.E -= p.phi_frus * (1 + 0.5 * (this.streak - 1));
    }
    this.E = clip(this.E, 0, 1);
    if (lastPlannedTask) return false;
    const q = p.q_max * Math.max(0, (p.E_q - this.E) / p.E_q);
    return this.quitRng.next() < q;
  }
}
