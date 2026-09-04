import fs from 'node:fs';
import path from 'node:path';
import { generateDataset, type SeedDataset } from './generate';

export const DEFAULT_SEED = 'ledger-seed-v1';

function datasetPath(): string {
  return path.resolve(process.cwd(), 'data', 'seed-dataset.json');
}

let cached: SeedDataset | null = null;

/**
 * Loads the seed dataset for `seed`, generating it deterministically if it
 * isn't cached on disk yet (and persisting it once generated, so `npm run
 * replay` works standalone without requiring `npm run seed` first).
 */
export function loadOrGenerateDataset(seed: string = process.env.LEDGER_SEED || DEFAULT_SEED): SeedDataset {
  if (cached && cached.seed === seed) return cached;

  const p = datasetPath();
  if (fs.existsSync(p)) {
    const onDisk = JSON.parse(fs.readFileSync(p, 'utf-8')) as SeedDataset;
    if (onDisk.seed === seed) {
      cached = onDisk;
      return cached;
    }
  }

  const fresh = generateDataset(seed);
  try {
    writeDataset(fresh);
  } catch {
    // Writing is a caching optimization (so the next call, or the next
    // process, doesn't regenerate) — not a correctness requirement.
    // Serverless runtimes (Vercel functions, in particular) ship a
    // read-only filesystem outside of /tmp; failing to cache there
    // should never take the app down. `npm run seed` as part of the
    // build step is what actually keeps the bundled dataset fresh in
    // that environment — see README's Deployment section.
  }
  cached = fresh;
  return cached;
}

export function writeDataset(dataset: SeedDataset): void {
  const p = datasetPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(dataset, null, 2));
}
