// Worker thread entry point: runs one job at a time (see pool.ts).

import { parentPort } from 'node:worker_threads';
import { handle, type JobKind } from './jobs.ts';

parentPort!.on('message', async (msg: { id: number; kind: JobKind; payload: unknown }) => {
  try {
    const result = await handle(msg.kind, msg.payload);
    parentPort!.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort!.postMessage({ id: msg.id, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
