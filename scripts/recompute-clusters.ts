/**
 * `npm run clusters:recompute`
 *
 * Fetches history through the DATA_MODE-aware QuoteSource (Section 1),
 * computes clusters (Section 4: correlation clustering, sector fallback if
 * there isn't enough history or the result is degenerate), and caches the
 * result in the `clusters` table (Section 2). Meant to run weekly via a
 * scheduled job in production, never on the read path — this script is
 * that job's body.
 */

import { createClock, createQuoteSource } from '../src/lib/data-mode';
import { listActiveSymbols } from '../db/queries/symbols';
import { replaceClustersForDate } from '../db/queries/clusters';
import { closePool } from '../db/client';
import { computeClusters } from '../src/clustering/compute-clusters';
import { DEFAULT_CORRELATION_OPTIONS } from '../src/clustering/correlation';
import type { SymbolReturns } from '../src/clustering/types';
import { returnsFromCloses } from '../src/significance/stats';

const HISTORY_DAYS = 120;

async function main() {
  const clock = createClock();
  const quotes = createQuoteSource(clock);

  const symbols = await listActiveSymbols();
  if (symbols.length === 0) {
    throw new Error('No active symbols in `symbols` table — run `npm run sync-symbols` first.');
  }

  const returns: SymbolReturns[] = [];
  let latestSessionDate = '';

  for (const s of symbols) {
    const history = await quotes.getHistory(s.symbol, HISTORY_DAYS);
    if (history.length < 2) continue;
    returns.push({ symbol: s.symbol, returns: returnsFromCloses(history.map((c) => c.c)) });
    const last = history[history.length - 1]!.sessionDate;
    if (last > latestSessionDate) latestSessionDate = last;
  }

  if (!latestSessionDate) {
    throw new Error('No candle history available for any active symbol.');
  }

  const result = computeClusters({
    symbols: symbols.map((s) => ({ symbol: s.symbol, sector: s.sector })),
    returns,
    options: DEFAULT_CORRELATION_OPTIONS,
  });

  const method = result.clusters[0]?.method ?? 'sector';
  console.log(`Method: ${method} (${result.clusters.length} clusters, session ${latestSessionDate})`);
  for (const c of result.clusters) {
    console.log(`  ${c.clusterId}: ${c.members.join(', ')}`);
  }

  await replaceClustersForDate(
    latestSessionDate,
    result.clusters.map((c) => ({ clusterId: c.clusterId, members: c.members, method: c.method })),
  );
  console.log(`Cached ${result.clusters.length} clusters for ${latestSessionDate}.`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    await closePool();
    console.error(err);
    process.exit(1);
  });
