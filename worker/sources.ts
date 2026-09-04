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
 * matching anything after the next `npm run seed`. Index 20 stays clear
 * of the other fixtures (the split, both breaks, the volume spike, all at
 * indices <= 15) and far enough from the end of a 130-session dataset to
 * read as a genuine "earlier" event, not today's.
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
 * conflict above. In live mode there's no second vendor wired up yet
 * (same documented gap as Section 1's LiveQuoteSource) — secondary is
 * just a second handle on the same source, which reconcileQuotes will
 * always find "confirmed" since they're identical; wire a real second
 * vendor in here when one exists, nothing else needs to change.
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
