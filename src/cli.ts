// Command-line entry point (SIMULATION_SPEC.md section 4.3).
//   npm run sim -- --exp cal | pipeline | field | explain | sensitivity | all [--quick] [--fast] [--allow-dirty] [--workers n]

import { runCalibration } from './experiments/cal.ts';
import type { RunOptions } from './experiments/common.ts';
import { runExplainExperiment } from './experiments/explain_audit.ts';
import { runFieldExperiment } from './experiments/field.ts';
import { runPipelineExperiment } from './experiments/pipeline.ts';
import { runSensitivityExperiment } from './experiments/sensitivity.ts';

const EXPERIMENTS: Record<string, (o: RunOptions) => Promise<unknown>> = {
  cal: runCalibration,
  pipeline: runPipelineExperiment,
  field: runFieldExperiment,
  explain: runExplainExperiment,
  sensitivity: runSensitivityExperiment,
};

function parse(argv: string[]): { exp: string; opts: RunOptions } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const exp = get('--exp');
  if (!exp || (exp !== 'all' && !(exp in EXPERIMENTS))) {
    throw new Error(`usage: --exp ${[...Object.keys(EXPERIMENTS), 'all'].join(' | ')} [--quick] [--fast] [--allow-dirty] [--workers n]`);
  }
  const workers = get('--workers');
  return {
    exp,
    opts: {
      quick: argv.includes('--quick'),
      fast: argv.includes('--fast'),
      allowDirty: argv.includes('--allow-dirty'),
      workers: workers === undefined ? undefined : Number(workers),
    },
  };
}

async function main(): Promise<void> {
  const { exp, opts } = parse(process.argv.slice(2));
  const order = exp === 'all' ? Object.keys(EXPERIMENTS) : [exp];
  for (const name of order) {
    const t0 = performance.now();
    console.log(`== ${name}${opts.quick ? ' (quick)' : ''}`);
    await EXPERIMENTS[name](opts);
    console.log(`== ${name} done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
