/**
 * `npm run worker`
 *
 * The standalone long-lived ingestion process — not a Next.js route, per
 * the brief. Runs independently of the web app. Day-to-day production
 * ingestion is the daily GitHub Action (.github/workflows/daily-ingest.yml)
 * instead, since an always-on poller bills continuously and keeps Neon
 * awake; this runs locally, or on Railway (railway.json) when a window
 * genuinely needs live polling.
 */

import 'dotenv/config';
import { createSources } from './sources';
import { startWorkerLoop } from './loop';
import { closePool } from '../db/client';

async function main() {
  const sources = createSources();
  const stop = await startWorkerLoop(sources);

  const shutdown = async (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down...`);
    stop();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
