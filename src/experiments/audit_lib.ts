// Explanation audit by replay of task logs (SIMULATION_SPEC.md section 9.4). Pure functions on parsed task rows.
// Replay is valid without re-simulating: reward decisions do not affect learners and the explanation rule affects nothing else.

import { explainV2, type Explanation } from '../core/explain.ts';
import { renderExplanation } from '../core/templates.ts';
import { clip, type AlgorithmConfig, type Contributions, type Factor, type Output } from '../core/types.ts';
import { csvLine } from '../sim/log.ts';
import {
  category,
  deletionNecessity,
  jaccard,
  nonContributing,
  signInconsistent,
  sufficiency,
} from '../sim/explainMetrics.ts';
import type { SimRng } from '../sim/rng.ts';

export interface TaskRecord {
  cell: string;
  seed: number;
  learner: number;
  session: number;
  task: number;
  D_base: number;
  D: number;
  u: number;
  b: number;
  e: number;
  c: Contributions; // reward contributions
  aiReward: number;
  ePrev: number;
  ePrev2: number | null;
  cDiff: number | null;
  stepPlanned: number | null;
  stepRealized: number | null;
  suppressed: boolean;
  v2r: Factor[] | null;
  v2d: Factor[] | null;
  v1: Factor;
  v1d: Factor | null;
  randR: Factor | null;
  randD: Factor | null;
}

const factors = (s: string): Factor[] | null => (s === '' ? null : (s.split('|') as Factor[]));
const num = (s: string): number | null => (s === '' ? null : Number(s));

/** Parses task CSV text (with header) into records. */
export function parseTasks(csv: string): TaskRecord[] {
  const lines = csv.split('\n');
  const header = lines[0].split(',');
  const ix = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`task log: missing column ${name}`);
    return i;
  };
  const I = {
    cell: ix('cell'), seed: ix('seed'), learner: ix('learner'), session: ix('session'), task: ix('task'),
    D_base: ix('D_base'), D: ix('D'), u: ix('u'), b: ix('b'), e: ix('e'), c_u: ix('c_u'), c_b: ix('c_b'),
    c_e: ix('c_e'), aiReward: ix('aiReward'), e_prev: ix('e_prev'), e_prev2: ix('e_prev2'), c_e_diff: ix('c_e_diff'),
    step_planned: ix('step_planned'), step_realized: ix('step_realized'), supp: ix('suppressed_by_clip'),
    v2r: ix('v2_reward_factors'), v2d: ix('v2_diff_factors'), v1: ix('v1_factor'), v1d: ix('v1_factor_diff'),
    randR: ix('rand_reward_factor'), randD: ix('rand_diff_factor'),
  };
  const out: TaskRecord[] = [];
  for (let k = 1; k < lines.length; k++) {
    if (lines[k] === '') continue;
    const f = lines[k].split(',');
    out.push({
      cell: f[I.cell],
      seed: Number(f[I.seed]),
      learner: Number(f[I.learner]),
      session: Number(f[I.session]),
      task: Number(f[I.task]),
      D_base: Number(f[I.D_base]),
      D: Number(f[I.D]),
      u: Number(f[I.u]),
      b: Number(f[I.b]),
      e: Number(f[I.e]),
      c: { u: Number(f[I.c_u]), b: Number(f[I.c_b]), e: Number(f[I.c_e]) },
      aiReward: Number(f[I.aiReward]),
      ePrev: Number(f[I.e_prev]),
      ePrev2: num(f[I.e_prev2]),
      cDiff: num(f[I.c_e_diff]),
      stepPlanned: num(f[I.step_planned]),
      stepRealized: num(f[I.step_realized]),
      suppressed: f[I.supp] === '1',
      v2r: factors(f[I.v2r]),
      v2d: factors(f[I.v2d]),
      v1: f[I.v1] as Factor,
      v1d: f[I.v1d] === '' ? null : (f[I.v1d] as Factor),
      randR: f[I.randR] === '' ? null : (f[I.randR] as Factor),
      randD: f[I.randD] === '' ? null : (f[I.randD] as Factor),
    });
  }
  return out;
}

/** A sample of at most max items, in original order, drawn with the given stream. */
export function sampleInOrder<T>(items: T[], max: number, rng: SimRng): T[] {
  if (items.length <= max) return items;
  const idx = rng.shuffle(items.map((_, i) => i)).slice(0, max).sort((a, b) => a - b);
  return idx.map((i) => items[i]);
}

/** One explained decision of either output, in a common form. */
export interface Decision {
  output: Output;
  rec: TaskRecord;
  c: Contributions;
  delta: number;
  v1: Factor;
  random: Factor | null;
}

export function rewardDecisions(recs: TaskRecord[]): Decision[] {
  return recs
    .filter((r) => r.v2r !== null)
    .map((r) => ({ output: 'reward', rec: r, c: r.c, delta: r.aiReward, v1: r.v1, random: r.randR }));
}

export function difficultyDecisions(recs: TaskRecord[]): Decision[] {
  return recs
    .filter((r) => r.v2d !== null)
    .map((r) => ({ output: 'difficulty', rec: r, c: { e: r.cDiff! }, delta: r.stepPlanned!, v1: r.v1d!, random: r.randD }));
}

function eps(output: Output, cfg: AlgorithmConfig): number {
  return output === 'reward' ? cfg.reward.eps_r : cfg.difficulty.eps_D;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const b01 = (x: boolean) => (x ? 1 : 0);

export const X1_COLUMNS = ['cell', 'seed', 'output', 'rule', 'n', 'NC', 'SI', 'DN', 'SU', 'AGR'] as const;

/** X1: v1 vs v2 vs random on NC, SI, DN, SU; AGR = v1 primary equals v2 primary. One row per seed x output x rule. */
export function auditX1(cell: string, decisions: Decision[], cfg: AlgorithmConfig, deltaTie: number): string {
  let out = '';
  const bySeed = groupBy(decisions, (d) => `${d.rec.seed}|${d.output}`);
  for (const [key, ds] of bySeed) {
    const [seed, output] = key.split('|');
    const e = eps(output as Output, cfg);
    const m: Record<string, Record<string, number[]>> = { v1: {}, v2: {}, random: {} };
    for (const rule of Object.keys(m)) for (const k of ['NC', 'SI', 'DN', 'SU', 'AGR']) m[rule][k] = [];
    for (const d of ds) {
      const v2 = explainV2(d.output, d.c, d.delta, e, deltaTie) as Explanation;
      const named: Record<string, Factor[]> = { v1: [d.v1], v2: v2.factors, random: d.random ? [d.random] : [] };
      for (const rule of Object.keys(m)) {
        const f = named[rule];
        if (f.length === 0) continue;
        m[rule].NC.push(b01(nonContributing(f, d.c)));
        m[rule].SI.push(b01(signInconsistent(f[0], d.c, d.delta)));
        m[rule].DN.push(b01(deletionNecessity(f, d.c, e)));
        m[rule].SU.push(b01(sufficiency(f, d.c, e)));
        m[rule].AGR.push(b01(f[0] === v2.factors[0]));
      }
    }
    for (const rule of Object.keys(m)) {
      out += csvLine([cell, Number(seed), output, rule, m[rule].NC.length, mean(m[rule].NC), mean(m[rule].SI),
        mean(m[rule].DN), mean(m[rule].SU), mean(m[rule].AGR)]);
    }
  }
  return out;
}

export const X2_COLUMNS = [
  'cell', 'seed', 'output', 'noise_sd', 'delta_tie', 'n_decisions', 'n_draws', 'n_draws_same_category',
  'category_change_share', 'ST_exact', 'ST_jaccard', 'TF',
] as const;

function sameSet(a: readonly Factor[], b: readonly Factor[]): boolean {
  return a.length === b.length && a.every((f) => b.includes(f));
}

function rewardContribs(u: number, b: number, e: number, w: { alpha: number; beta: number; gamma: number }): Contributions {
  return { u: w.alpha * u, b: w.beta * b, e: w.gamma * e };
}

const sumC = (c: Contributions) => (c.u ?? 0) + (c.b ?? 0) + (c.e ?? 0);

/**
 * X2: stability under noise added to (u, b, e), then clipped to [-1, 1]. The same noise draws are used for every
 * delta_tie (common random numbers). Difficulty decisions: both e values are perturbed and only the share of draws
 * that change the decision category is reported (single input, so v2 is stable by construction).
 */
export function auditX2(
  cell: string,
  decisions: Decision[],
  cfg: AlgorithmConfig,
  noiseSds: number[],
  ties: number[],
  draws: number,
  rng: SimRng,
): string {
  let out = '';
  const w = cfg.reward;
  for (const [key, ds] of groupBy(decisions, (d) => `${d.rec.seed}|${d.output}`)) {
    const [seed, output] = key.split('|');
    const e = eps(output as Output, cfg);
    for (const sd of noiseSds) {
      const acc = ties.map(() => ({ exact: 0, jac: 0, same: 0, twoFactor: 0 }));
      let total = 0;
      let changed = 0;
      for (const d of ds) {
        const r = d.rec;
        const baseCat = category(d.delta, e);
        const base = ties.map((t) => explainV2(d.output, d.c, d.delta, e, t)!.factors);
        base.forEach((f, ti) => (acc[ti].twoFactor += b01(f.length === 2)));
        for (let k = 0; k < draws; k++) {
          total++;
          if (output === 'reward') {
            const c = rewardContribs(
              clip(r.u + sd * rng.normal(), -1, 1),
              clip(r.b + sd * rng.normal(), -1, 1),
              clip(r.e + sd * rng.normal(), -1, 1),
              w,
            );
            const dNew = sumC(c);
            if (category(dNew, e) !== baseCat) {
              changed++;
              continue;
            }
            ties.forEach((t, ti) => {
              const f = explainV2('reward', c, dNew, e, t)!.factors;
              acc[ti].same++;
              acc[ti].exact += b01(sameSet(f, base[ti]));
              acc[ti].jac += jaccard(f, base[ti]);
            });
          } else {
            const e1 = clip(r.ePrev + sd * rng.normal(), -1, 1);
            const e2 = clip((r.ePrev2 ?? 0) + sd * rng.normal(), -1, 1);
            const dNew = r.D_base * (e1 - e2);
            if (category(dNew, e) !== baseCat) {
              changed++;
              continue;
            }
            ties.forEach((_, ti) => {
              acc[ti].same++;
              acc[ti].exact++;
              acc[ti].jac++;
            });
          }
        }
      }
      ties.forEach((t, ti) => {
        const a = acc[ti];
        out += csvLine([cell, Number(seed), output, sd, t, ds.length, total, a.same, changed / total,
          a.same ? a.exact / a.same : NaN, a.same ? a.jac / a.same : NaN, a.twoFactor / ds.length]);
      });
    }
  }
  return out;
}

export const X3_COLUMNS = ['cell', 'alpha', 'beta', 'gamma', 'delta_tie', 'n_rows', 'XR', 'TF', 'DN', 'ST_exact'] as const;

/** Simplex grid with the given step: (alpha, beta, gamma) >= 0, sum 1. */
export function simplexGrid(step: number): { alpha: number; beta: number; gamma: number }[] {
  const n = Math.round(1 / step);
  const out: { alpha: number; beta: number; gamma: number }[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) out.push({ alpha: i / n, beta: j / n, gamma: (n - i - j) / n });
  return out;
}

/** X3: reward weight sweep on all reward decisions (explained or not), with noise at one level for ST_exact. */
export function auditX3(
  cell: string,
  recs: TaskRecord[],
  cfg: AlgorithmConfig,
  step: number,
  ties: number[],
  noiseSd: number,
  draws: number,
  rng: SimRng,
): string {
  let out = '';
  const e = cfg.reward.eps_r;
  // the same noise for every weight point and tie (common random numbers)
  const noise = recs.map(() => Array.from({ length: draws }, () => [rng.normal(), rng.normal(), rng.normal()]));
  for (const wt of simplexGrid(step)) {
    for (const t of ties) {
      let explained = 0;
      let two = 0;
      let dn = 0;
      let same = 0;
      let exact = 0;
      recs.forEach((r, i) => {
        const c = rewardContribs(r.u, r.b, r.e, wt);
        const delta = sumC(c);
        const x = explainV2('reward', c, delta, e, t);
        if (!x) return;
        explained++;
        two += b01(x.factors.length === 2);
        dn += b01(deletionNecessity(x.factors, c, e));
        const cat = category(delta, e);
        for (const z of noise[i]) {
          const cn = rewardContribs(clip(r.u + noiseSd * z[0], -1, 1), clip(r.b + noiseSd * z[1], -1, 1), clip(r.e + noiseSd * z[2], -1, 1), wt);
          const dNew = sumC(cn);
          if (category(dNew, e) !== cat) continue;
          same++;
          exact += b01(sameSet(explainV2('reward', cn, dNew, e, t)!.factors, x.factors));
        }
      });
      out += csvLine([cell, wt.alpha, wt.beta, wt.gamma, t, recs.length, explained / recs.length,
        explained ? two / explained : NaN, explained ? dn / explained : NaN, same ? exact / same : NaN]);
    }
  }
  return out;
}

export const X4_COLUMNS = ['cell', 'seed', 'output', 'learner_sessions', 'mean', 'sd', 'p50', 'p90', 'max', 'share_zero'] as const;
export const X4_HIST_COLUMNS = ['cell', 'seed', 'output', 'count', 'learner_sessions'] as const;

/** X4: number of v2 explanations a learner would see per attended session, by output. */
export function auditX4(cell: string, recs: TaskRecord[]): { summary: string; hist: string } {
  let summary = '';
  let hist = '';
  for (const [seed, rs] of groupBy(recs, (r) => String(r.seed))) {
    const sessions = groupBy(rs, (r) => `${r.learner}|${r.session}`);
    for (const output of ['reward', 'difficulty'] as Output[]) {
      const counts = [...sessions.values()].map((g) => g.filter((r) => (output === 'reward' ? r.v2r : r.v2d) !== null).length);
      counts.sort((a, b) => a - b);
      const m = mean(counts);
      const sd = Math.sqrt(mean(counts.map((c) => (c - m) ** 2)));
      const q = (p: number) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
      summary += csvLine([cell, Number(seed), output, counts.length, m, sd, q(0.5), q(0.9), counts[counts.length - 1],
        counts.filter((c) => c === 0).length / counts.length]);
      const h = new Map<number, number>();
      for (const c of counts) h.set(c, (h.get(c) ?? 0) + 1);
      for (const [c, n] of [...h.entries()].sort((a, b) => a[0] - b[0])) hist += csvLine([cell, Number(seed), output, c, n]);
    }
  }
  return { summary, hist };
}

/** Text a v1 explanation would show for a decision: the output's frame, the factor's reward-contribution sign. */
function v1Text(output: Output, delta: number, factor: Factor, rewardC: Contributions): string {
  return renderExplanation(output, delta > 0 ? 'up' : 'down', [{ factor, contribution: rewardC[factor] ?? 0 }]);
}

/** X5: three real cases chosen by fixed rules (first match in log order). */
export function exampleCases(recs: TaskRecord[], cfg: AlgorithmConfig): Record<string, unknown>[] {
  const rules: { id: string; rule: string; match: (r: TaskRecord) => boolean; output: Output }[] = [
    { id: 'a', rule: 'first single-factor difficulty decrease', output: 'difficulty',
      match: (r) => r.v2d !== null && r.v2d.length === 1 && (r.stepPlanned ?? 0) < 0 },
    { id: 'b', rule: 'first two-factor reward explanation', output: 'reward', match: (r) => r.v2r !== null && r.v2r.length === 2 },
    { id: 'c', rule: 'first difficulty decision where v1 names a non-contributing factor', output: 'difficulty',
      match: (r) => r.v2d !== null && r.v1d !== null && r.v1d !== 'e' },
  ];
  return rules.map(({ id, rule, match, output }) => {
    const r = recs.find(match);
    if (!r) return { case: id, rule, found: false };
    const isReward = output === 'reward';
    const c = isReward ? r.c : { e: r.cDiff! };
    const delta = isReward ? r.aiReward : r.stepPlanned!;
    const e = eps(output, cfg);
    const v2 = explainV2(output, c, delta, e, cfg.explanation.delta_tie)!;
    const v1 = isReward ? r.v1 : r.v1d!;
    return {
      case: id,
      rule,
      found: true,
      cell: r.cell,
      seed: r.seed,
      learner: r.learner,
      session: r.session,
      task: r.task,
      output,
      inputs: isReward
        ? { u: r.u, b: r.b, e: r.e, weights: { alpha: cfg.reward.alpha, beta: cfg.reward.beta, gamma: cfg.reward.gamma } }
        : { e_prev: r.ePrev, e_prev2: r.ePrev2, D_base: r.D_base, D: r.D, step_realized: r.stepRealized },
      contributions: c,
      decision_value: delta,
      threshold: e,
      v2: { factors: v2.factors, shares: v2.shares, text: v2.text },
      v1: {
        factor: v1,
        contributes: c[v1] !== undefined,
        text: v1Text(output, delta, v1, r.c),
        note: isReward ? undefined : 'v1 uses the dominant reward contribution of the same decision point for every output',
      },
    };
  });
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    let g = m.get(k);
    if (!g) m.set(k, (g = []));
    g.push(it);
  }
  return m;
}

