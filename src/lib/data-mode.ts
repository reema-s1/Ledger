/**
 * The single place DATA_MODE is read. Every other module gets a Clock and
 * a QuoteSource from here instead of deciding live-vs-replay itself.
 */

import type { Clock } from './time/clock';
import { LiveClock } from './time/live-clock';
import { ReplayClock } from './time/replay-clock';
import type { QuoteSource } from './quotes/quote-source';
import { LiveQuoteSource } from './quotes/live-quote-source';
import { ReplayQuoteSource } from './quotes/replay-quote-source';
import { unconfiguredLiveFetcher } from './quotes/live-provider-stub';
import { loadOrGenerateDataset } from '../seed/dataset';
import { sessionOpenTs } from './time/market-calendar';

export type DataMode = 'live' | 'replay';

export function getDataMode(): DataMode {
  const raw = (process.env.DATA_MODE ?? 'replay').toLowerCase();
  if (raw !== 'live' && raw !== 'replay') {
    throw new Error(`Invalid DATA_MODE "${raw}". Expected "live" or "replay".`);
  }
  return raw;
}

/**
 * Creates the Clock for the current DATA_MODE. In replay mode the clock
 * starts at the seed dataset's first session so `now()` is meaningful
 * before the first tick has streamed.
 */
export function createClock(mode: DataMode = getDataMode()): Clock {
  if (mode === 'live') return new LiveClock();
  const dataset = loadOrGenerateDataset();
  const firstSessionDate = dataset.sessionDates[0];
  if (!firstSessionDate) throw new Error('Seed dataset is empty; run `npm run seed`.');
  // Start exactly at the first session's market open, not its close ts (a
  // close ts is later than that session's own first intraday tick, which
  // would make the replay clock move backwards) and not midnight (which
  // would waste real time waiting through pre-market at any given speed).
  return new ReplayClock(sessionOpenTs(firstSessionDate));
}

export interface CreateQuoteSourceOptions {
  /** Replay-only: simulated seconds streamed per real second. Default 60. */
  speed?: number;
}

export function createQuoteSource(clock: Clock, options: CreateQuoteSourceOptions = {}): QuoteSource {
  const mode = getDataMode();

  if (mode === 'live') {
    if (!(clock instanceof LiveClock)) {
      throw new Error('createQuoteSource(mode=live) requires a LiveClock (from createClock("live")).');
    }
    return new LiveQuoteSource({ fetcher: unconfiguredLiveFetcher });
  }

  if (!(clock instanceof ReplayClock)) {
    throw new Error('createQuoteSource(mode=replay) requires a ReplayClock (from createClock("replay")).');
  }
  return new ReplayQuoteSource(clock, { speed: options.speed ?? 60 });
}
