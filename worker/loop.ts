import { listActiveSymbols } from '../db/queries/symbols';
import { getWatchlistCounts } from '../db/queries/watchlist';
import { pollingTierFor } from './polling-tiers';
import { IntervalRunner } from './backpressure';
import { ingestSymbol } from './ingest';
import type { Sources } from './sources';

/**
 * One IntervalRunner per active symbol, at its watchlist-tier's interval.
 * Each runner's task is independent — a slow/failing symbol only skips
 * its own ticks (via IntervalRunner's backpressure handling), never
 * blocks or drops another symbol's polling.
 */
export async function startWorkerLoop(sources: Sources): Promise<() => void> {
  const symbols = await listActiveSymbols();
  const watcherCounts = await getWatchlistCounts();

  const runners: IntervalRunner[] = symbols.map((s) => {
    const count = watcherCounts.get(s.symbol) ?? 0;
    const { tier, intervalMs } = pollingTierFor(count);

    return new IntervalRunner({
      label: `${s.symbol}(${tier})`,
      intervalMs,
      task: async () => {
        const results = await ingestSymbol(s.symbol, sources);
        for (const result of results) {
          if (result.significanceEvent) {
            console.log(`[worker] ${result.symbol} ${result.sessionDate}: ${result.significanceEvent}`);
          }
          if (result.resolvedPriorEvent) {
            console.log(`[worker] ${result.symbol} ${result.sessionDate}: resolved a prior event`);
          }
          if (result.reassuranceEvent) {
            console.log(`[worker] ${result.symbol} ${result.sessionDate}: reassurance (market-explained)`);
          }
        }
      },
      onSkip: (label, skipped) => console.warn(`[worker] ${label}: still busy, skipped tick #${skipped}`),
      onCaughtUp: (label, total) => console.warn(`[worker] ${label}: caught up after skipping ${total} tick(s)`),
      onError: (label, err) => console.error(`[worker] ${label}: ingestion error:`, err),
    });
  });

  for (const runner of runners) runner.start();
  console.log(`[worker] started ${runners.length} polling loop(s) for ${symbols.length} active symbol(s).`);

  return () => {
    for (const runner of runners) runner.stop();
  };
}
