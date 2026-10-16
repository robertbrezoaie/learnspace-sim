// Gzipped CSV writers (SIMULATION_SPEC.md section 11). Output is byte-identical for identical input:
// numbers use JavaScript's shortest round-trip format, booleans are 0/1, missing values are empty.

import { createWriteStream, mkdirSync, writeFileSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { createGzip, gzipSync, type Gzip } from 'node:zlib';

export type Cell = string | number | boolean | null | undefined;

function format(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvLine(values: readonly Cell[]): string {
  return values.map(format).join(',') + '\n';
}

/** Rows as objects with fixed columns. */
export function csvText(columns: readonly string[], rows: readonly Record<string, Cell>[], withHeader = true): string {
  let out = withHeader ? columns.join(',') + '\n' : '';
  for (const r of rows) out += csvLine(columns.map((c) => r[c]));
  return out;
}

export function writeGzipFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(text, { level: 6 }));
}

/** A streaming gzipped CSV file: header first, then text chunks in the order they are written. */
export class GzCsvWriter {
  private readonly gz: Gzip;
  private readonly out: WriteStream;
  private readonly done: Promise<void>;

  constructor(path: string, columns: readonly string[]) {
    mkdirSync(dirname(path), { recursive: true });
    this.gz = createGzip({ level: 6 });
    this.out = createWriteStream(path);
    this.done = new Promise((resolve, reject) => {
      this.out.on('finish', () => resolve());
      this.out.on('error', reject);
      this.gz.on('error', reject);
    });
    this.gz.pipe(this.out);
    this.gz.write(columns.join(',') + '\n');
  }

  write(text: string): void {
    if (text.length > 0) this.gz.write(text);
  }

  close(): Promise<void> {
    this.gz.end();
    return this.done;
  }
}
