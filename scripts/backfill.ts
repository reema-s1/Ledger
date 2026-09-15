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
  const failures: { symbol: string; message: string }[] = [];
  let events = 0;

  for (const s of symbols) {
    // Per-symbol isolation, matching what the long-running worker already
    // gets for free from IntervalRunner's own try/catch. Without it one
    // bad ticker aborts the whole run — and because this loop is
    // alphabetical, everything sorting after it silently never ingests.
    // That is not hypothetical: LTIM has no resolvable Yahoo ticker (a
    // known, documented gap), so it 404s on every single run and used to
    // take MPHASIS through WIPRO down with it.
    try {
      // recheckLatest: this script is the daily job, so re-scoring the newest
      // stored session lets a badly-scored day heal on the next run instead
      // of needing a hand-run delete (see ingestSymbolSessions).
      const results = await ingestSymbol(s.symbol, sources, { recheckLatest: true });
      for (const r of results) {
        outcomeCounts.set(r.outcome, (outcomeCounts.get(r.outcome) ?? 0) + 1);
        if (r.significanceEvent) events += 1;
        if (r.outcome === 'corporate-action') {
          console.log(`  ${s.symbol} ${r.sessionDate}: corporate action recorded`);
        }
      }
      console.log(`${s.symbol}: ${results.length} session(s) processed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ symbol: s.symbol, message });
      console.error(`${s.symbol}: FAILED — ${message}`);
    }
  }

  console.log(`\nOutcomes: ${[...outcomeCounts.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`Significance events raised: ${events}`);

  if (failures.length > 0) {
    console.error(`\n${failures.length}/${symbols.length} symbol(s) failed:`);
    for (const f of failures) console.error(`  - ${f.symbol}: ${f.message}`);
  }

  // Exit non-zero only when *nothing* got through. A few individually
  // broken tickers are an expected steady state (a delisting, a renamed
  // ticker) and shouldn't turn a scheduled run permanently red — a job
  // that always fails is a job whose failures stop being read, which is
  // the same alert-fatigue problem the significance engine exists to
  // avoid. Every symbol failing is different: that's the vendor blocking
  // us or the database being unreachable, and it should be loud.
  if (symbols.length > 0 && failures.length === symbols.length) {
    throw new Error('Every symbol failed to ingest — treating as a systemic failure, not isolated bad tickers.');
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
