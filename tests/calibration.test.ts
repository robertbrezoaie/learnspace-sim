// Test 11 (SIMULATION_SPEC.md section 14): field-replica tier success rates match the calibration.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALIBRATION_FILE, loadTierDeltas } from '../src/experiments/field.ts';
import { loadLearnerParams, loadScenarios } from '../src/sim/config.ts';
import { Learner } from '../src/sim/learner.ts';
import { drawPopulation } from '../src/sim/population.ts';

describe('calibration', () => {
  const cal = JSON.parse(readFileSync(CALIBRATION_FILE, 'utf8'));
  const deltas = loadTierDeltas();
  const p = loadLearnerParams();
  const scenario = loadScenarios().S2;
  const pop = drawPopulation(20_000, 2, p); // a different seed from the calibration population

  for (const tier of ['warmup', 'easy', 'hard'] as const) {
    it(`gives simulated first-attempt success within 0.02 of the ${tier} target (or the recorded reachable value)`, () => {
      const expected = cal.field_tiers[tier].reachable ? cal.field_tiers[tier].target : cal.field_tiers[tier].aimed;
      let correct = 0;
      pop.forEach((t, i) => {
        const l = new Learner(i, t, p, scenario, 2);
        if (l.doTask(deltas[tier], () => 'plain').observedCorrect) correct++;
      });
      expect(Math.abs(correct / pop.length - expected)).toBeLessThan(0.02);
    });
  }
});
