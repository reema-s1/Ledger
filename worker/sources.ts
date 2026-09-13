import { createClock, createQuoteSource, getDataMode } from '../src/lib/data-mode';
import type { Clock } from '../src/lib/time/clock';
import type { QuoteSource } from '../src/lib/quotes/quote-source';
import { loadOrGenerateDataset } from '../src/seed/dataset';
import { NoisyQuoteSource, type DeliberateConflict } from './noisy-quote-source';

/**
 * One deliberately injected disagreement so two-source conflict detection
 * has something real to catch in replay/demo mode — mirrors how Section 1
 * seeded a deliberate split and structural breaks into the dataset itself.
 * Picked by position (index 20), not a literal calendar date: the seed
 * dataset's session dates are anchored to "now" at generation time (see
 * src/seed/generate.ts), so a hardcoded date here would silently stop
 * matching anything after the next `npm run seed`. Index 20 is far
 * enough from the end of the dataset (~220 real sessions, or 130
 * synthetic ones if the real data file is deleted) to read as a genuine
 * "earlier" event, not today's — and, with the real dataset, lands well
 * before KOTAKBANK's real split (index 58 of 220), so the two fixtures
 * never collide on the same session.
 */
function buildDemoConflicts(): DeliberateConflict[] {
  const dataset = loadOrGenerateDataset();
  const conflictDate = dataset.sessionDates[20];
  if (!conflictDate) return [];
  return [{ symbol: 'ICICIBANK', sessionDate: conflictDate, offsetFraction: 0.05 }];
}

export interface Sources {
  clock: Clock;
  primary: QuoteSource;
  secondary: QuoteSource;
}

/**
 * Primary + secondary QuoteSource for the current DATA_MODE. In replay
 * mode, secondary is the primary wrapped with jitter + the deliberate
 * conflict above. Live mode's primary is a real fetch now
 * (yahoo-live-fetcher.ts) — but there's still no second, genuinely
 * independent live vendor wired up (NSE's own site blocks non-browser
 * traffic; no other free source with real NSE coverage was found
 * reachable) — secondary is just a second handle on the same source,
 * which reconcileQuotes will always find "confirmed" since they're
 * identical. Wire a real second vendor in here when one exists; nothing
 * else needs to change.
 */
export function createSources(): Sources {
  const clock = createClock();
  const primary = createQuoteSource(clock);
  const mode = getDataMode();

  const secondary =
    mode === 'replay'
      ? new NoisyQuoteSource(primary, 'secondary-demo', 0.0015, buildDemoConflicts())
      : primary;

  return { clock, primary, secondary };
}
