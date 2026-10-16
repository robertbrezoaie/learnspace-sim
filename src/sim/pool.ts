// Parallel job runner on worker_threads. Results are delivered in job order, so outputs do not depend on timing.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { handle, type JobKind } from './jobs.ts';

export interface Job {
  kind: JobKind;
  payload: unknown;
}

export interface PoolOptions {
  workers?: number; // 0 = run inline in this thread (tests)
  label?: string;
  quiet?: boolean;
}

function progress(label: string, done: number, total: number, t0: number, quiet: boolean): void {
  if (quiet) return;
  const elapsed = (performance.now() - t0) / 1000;
  const eta = done > 0 ? (elapsed / done) * (total - done) : 0;
  process.stdout.write(`\r[${label}] ${done}/${total} jobs, ${elapsed.toFixed(0)}s elapsed, ETA ${eta.toFixed(0)}s   `);
  if (done === total) process.stdout.write('\n');
}

/** Runs every job and calls onResult(index, result) in index order. */
export async function runJobs<R>(jobs: Job[], onResult: (index: number, result: R) => void | Promise<void>, opts: PoolOptions = {}): Promise<void> {
  const label = opts.label ?? 'jobs';
  const quiet = opts.quiet ?? false;
  const t0 = performance.now();
  const nWorkers = opts.workers ?? Math.max(1, availableParallelism() - 2);
  if (nWorkers === 0 || jobs.length <= 1) {
    for (let i = 0; i < jobs.length; i++) {
      await onResult(i, (await handle(jobs[i].kind, jobs[i].payload)) as R);
      progress(label, i + 1, jobs.length, t0, quiet);
    }
    return;
  }

  const buffered = new Map<number, R>();
  let nextToDeliver = 0;
  let nextToStart = 0;
  let done = 0;
  let delivering = Promise.resolve();

  await new Promise<void>((resolve, reject) => {
    const workers: Worker[] = [];
    let finished = false;
    const fail = (err: unknown) => {
      if (finished) return;
      finished = true;
      for (const w of workers) void w.terminate();
      reject(err);
    };
    const startNext = (w: Worker) => {
      if (nextToStart >= jobs.length) {
        void w.terminate();
        return;
      }
      const id = nextToStart++;
      w.postMessage({ id, kind: jobs[id].kind, payload: jobs[id].payload });
    };
    const count = Math.min(nWorkers, jobs.length);
    for (let k = 0; k < count; k++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] });
      workers.push(w);
      w.on('error', fail);
      w.on('message', (msg: { id: number; result?: R; error?: string }) => {
        if (msg.error !== undefined) return fail(new Error(`job ${msg.id} failed: ${msg.error}`));
        buffered.set(msg.id, msg.result as R);
        done++;
        progress(label, done, jobs.length, t0, quiet);
        delivering = delivering.then(async () => {
          while (buffered.has(nextToDeliver)) {
            const r = buffered.get(nextToDeliver) as R;
            buffered.delete(nextToDeliver);
            await onResult(nextToDeliver, r);
            nextToDeliver++;
          }
          if (nextToDeliver === jobs.length && !finished) {
            finished = true;
            resolve();
          }
        }).catch(fail);
        startNext(w);
      });
      startNext(w);
    }
  });
}
