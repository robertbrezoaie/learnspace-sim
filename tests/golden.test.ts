// Test 12 (SIMULATION_SPEC.md section 14): golden test. Any change of the stored summary must be explained in DECISIONS.md.
// Regenerate with: UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runPipeline } from '../src/sim/engine.ts';
import { summariseRun } from '../src/sim/jobs.ts';
import { loadAlgorithmConfig, loadLearnerParams, loadScenarios } from '../src/sim/config.ts';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'learners_summary.json');

function summary(): Record<string, Record<string, number>> {
  const algo = loadAlgorithmConfig();
  const lp = loadLearnerParams({ N: 50, S: 4 });
  const sc = loadScenarios().S2;
  const out: Record<string, Record<string, number>> = {};
  for (const [cell, difficulty, policy] of [['C1', 'STATIC', 'PLAIN'], ['C2', 'DDA-E', 'PLAIN'], ['B-TS', 'DDA-E', 'TS_DEPLOYED']] as const) {
    const r = runPipeline({ cell, difficulty, policy, scenario: sc, seed: 1, algo, learner: lp, tsMode: 'sample', logTasks: false, snapshotEvery: 100, snapshotDraws: 1000, curveEvery: 100 });
    out[cell] = Object.fromEntries(Object.entries(summariseRun(r.learnerCsv, r.runCsv)).map(([k, v]) => [k, Number(v.toPrecision(12))]));
  }
  return out;
}

describe('golden run', () => {
  it('reproduces the stored learners.csv summary of a small fixed run', () => {
    const now = summary();
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
      writeFileSync(GOLDEN, JSON.stringify(now, null, 2) + '\n');
      if (process.env.UPDATE_GOLDEN !== '1') throw new Error('golden file was missing and has been created; re-run the tests');
    }
    expect(now).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  });
});
