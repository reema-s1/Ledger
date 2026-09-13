/**
 * `npm run backfill`
 *
 * Runs Section 5's ingestion pipeline (worker/ingest.ts's ingestSymbol)
 * once for every active symbol, processing every session already present
 * in the current data source that's newer than what's in `candles`. The
 * worker loop (worker/loop.ts) does this incrementally, one new session
 * at a time, as real time (or replay time) passes — this script exists so
 * a fresh database can be caught up to "fully ingested" in one run,
 * without waiting on the clock, for local development and demos.
 */

import { listActiveSymbols } from '../db/queries/symbols';
import { createSources } from '../worker/sources';
import { ingestSymbol } from '../worker/ingest';
import { closePool } from '../db/client';

async function main() {
  const symbols = await listActiveSymbols();
  const sources = createSources();

  const outcomeCounts = new Map<string, number>();
  let events = 0;

  for (const s of symbols) {
    const results = await ingestSymbol(s.symbol, sources);
    for (const r of results) {
      outcomeCounts.set(r.outcome, (outcomeCounts.get(r.outcome) ?? 0) + 1);
      if (r.significanceEvent) events += 1;
      if (r.outcome === 'corporate-action') {
        console.log(`  ${s.symbol} ${r.sessionDate}: corporate action recorded`);
      }
    }
    console.log(`${s.symbol}: ${results.length} session(s) processed`);
  }

  console.log(`\nOutcomes: ${[...outcomeCounts.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`Significance events raised: ${events}`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
