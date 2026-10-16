// Test 8 (SIMULATION_SPEC.md section 14): information barrier and the purity of src/core.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'src', 'core');
const SIM = join(ROOT, 'src', 'sim');

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Module specifiers of every static import, re-export and dynamic import in a file. */
function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  return [...src.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]);
}

describe('information barrier', () => {
  const coreFiles = tsFiles(CORE);

  it('finds the core files', () => {
    expect(coreFiles.length).toBeGreaterThan(5);
  });

  it('src/core imports only from src/core (no src/sim, no Node or npm modules)', () => {
    for (const file of coreFiles) {
      for (const spec of imports(file)) {
        expect(spec.startsWith('.'), `${file} imports non-relative module ${spec}`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(target.startsWith(CORE + sep), `${file} imports ${spec} outside src/core`).toBe(true);
      }
    }
  });

  it('src/core uses no ambient randomness, clock, crypto, I/O or global process state', () => {
    for (const file of coreFiles) {
      const src = readFileSync(file, 'utf8');
      for (const banned of ['Math.random', 'Date.now', 'new Date', 'crypto', 'process.', 'require(', 'globalThis']) {
        expect(src.includes(banned), `${file} uses ${banned}`).toBe(false);
      }
    }
  });

  it('no feedback policy other than ORACLE imports oracle.ts (ORACLE itself lives in oracle.ts)', () => {
    const policies = join(SIM, 'policies.ts');
    if (!existsSync(policies)) return; // built at milestone M1
    for (const spec of imports(policies)) expect(spec.replace(/\.ts$/, '').endsWith('oracle')).toBe(false);
  });

  it('simulation code never uses Math.random', () => {
    for (const file of [...tsFiles(SIM), ...tsFiles(join(ROOT, 'src', 'experiments'))]) {
      expect(readFileSync(file, 'utf8').includes('Math.random'), file).toBe(false);
    }
  });
});
