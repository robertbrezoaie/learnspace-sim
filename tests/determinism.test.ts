// Tests 9 and 10 (SIMULATION_SPEC.md section 14): end-to-end determinism and common random numbers.
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { runPipelineExperiment } from '../src/experiments/pipeline.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

async function tinyRun(workers: number): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'lsim-'));
  dirs.push(root);
  await runPipelineExperiment(
    { quick: false, fast: false, allowDirty: true, workers, quiet: true, outRoot: root },
    { N: 20, S: 3, seeds: [1, 2], cells: ['C1', 'C2', 'B-TS'] },
  );
  return join(root, 'pipeline');
}

function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv.gz')).sort()) {
    out[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
  }
  return out;
}

describe('end-to-end determinism', () => {
  it('produces identical output files when run twice (inline and with worker threads)', async () => {
    const a = hashes(await tinyRun(0));
    const b = hashes(await tinyRun(0));
    const c = hashes(await tinyRun(2));
    expect(Object.keys(a).length).toBeGreaterThan(4);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("gives learner i the same theta0 in every cell for the same seed (common random numbers)", async () => {
    const dir = await tinyRun(0);
    const lines = gunzipSync(readFileSync(join(dir, 'learners.csv.gz'))).toString().trim().split('\n');
    const h = lines[0].split(',');
    const [iCell, iSeed, iL, iT] = ['cell', 'seed', 'learner', 'theta0'].map((c) => h.indexOf(c));
    const byKey = new Map<string, Set<string>>();
    const cells = new Set<string>();
    for (const line of lines.slice(1)) {
      const f = line.split(',');
      cells.add(f[iCell]);
      const k = `${f[iSeed]}|${f[iL]}`;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(f[iT]);
    }
    expect(cells.size).toBe(3);
    expect(byKey.size).toBe(40);
    for (const s of byKey.values()) expect(s.size).toBe(1);
  });
});
